use std::time::Duration;

use async_trait::async_trait;

use super::{
    AiProvider, CancelFlag, ChatMessage, EventSink, FinishReason, ProviderInfo, ProviderStatus,
    StreamEvent,
};
use crate::db::conversations::Role;
use crate::error::{AppError, AppResult};

/// Local provider that streams canned, prompt-aware replies. Lets the full
/// streaming pipeline be exercised without network access or credentials.
pub struct MockProvider {
    token_delay: Duration,
}

impl MockProvider {
    pub const ID: &'static str = "mock";

    pub fn new(token_delay: Duration) -> Self {
        Self { token_delay }
    }
}

impl Default for MockProvider {
    fn default() -> Self {
        Self::new(Duration::from_millis(22))
    }
}

#[async_trait]
impl AiProvider for MockProvider {
    fn info(&self) -> ProviderInfo {
        ProviderInfo {
            id: Self::ID.into(),
            name: "Local Preview".into(),
            description: "Built-in mock model that streams sample replies without network access."
                .into(),
            model: "mock-1".into(),
            is_local: true,
            status: ProviderStatus::Ready,
        }
    }

    async fn stream_chat(
        &self,
        messages: &[ChatMessage],
        sink: &dyn EventSink,
        cancel: &CancelFlag,
    ) -> AppResult<FinishReason> {
        let prompt = messages
            .iter()
            .rev()
            .find(|m| m.role == Role::User)
            .map(|m| m.content.as_str())
            .unwrap_or_default();

        let reply = compose_reply(prompt, messages.len());
        let chunks = chunk(&reply);
        let fail_at = prompt.contains("/error").then(|| chunks.len().min(12));

        for (index, piece) in chunks.into_iter().enumerate() {
            if cancel.is_cancelled() {
                return Ok(FinishReason::Cancelled);
            }
            if fail_at == Some(index) {
                return Err(AppError::Provider(
                    "simulated failure requested with /error".into(),
                ));
            }
            if !sink.emit(StreamEvent::Delta { text: piece }) {
                return Ok(FinishReason::Cancelled);
            }
            if !self.token_delay.is_zero() {
                // Vary pacing slightly so streaming reads naturally.
                let jitter = (index as u64 * 7919) % 3;
                tokio::time::sleep(self.token_delay * (1 + jitter as u32) / 2).await;
            }
        }
        Ok(FinishReason::Stop)
    }
}

/// Splits text into word-sized chunks that keep their trailing whitespace.
fn chunk(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        if !ch.is_whitespace() && current.ends_with(char::is_whitespace) {
            out.push(std::mem::take(&mut current));
        }
        current.push(ch);
    }
    if !current.is_empty() {
        out.push(current);
    }
    out
}

fn compose_reply(prompt: &str, turn_count: usize) -> String {
    let trimmed = prompt.trim();
    let lower = trimmed.to_lowercase();
    let is_greeting = ["hi", "hello", "hey", "good morning", "good evening"]
        .iter()
        .any(|g| lower == *g || lower.starts_with(&format!("{g} ")) || lower.starts_with(&format!("{g}!")));

    if is_greeting {
        return "Hello! I'm the **Local Preview** model built into AI Workspace.\n\n\
                I run entirely on this Mac and generate sample replies, so you can try \
                conversations, history, and projects before connecting a real AI provider.\n\n\
                Try asking me to outline a plan, summarize an idea, or draft some notes."
            .into();
    }

    let topic: String = trimmed
        .split_whitespace()
        .take(12)
        .collect::<Vec<_>>()
        .join(" ");
    let follow_up = if turn_count > 2 {
        "Building on what we've discussed so far, here's how I'd continue:"
    } else {
        "Here's a structured starting point:"
    };

    format!(
        "You asked about **{topic}**.\n\n\
         {follow_up}\n\n\
         1. **Clarify the goal** — define what a successful outcome looks like and how you'll measure it.\n\
         2. **Map the constraints** — time, budget, people, and anything that can't change.\n\
         3. **Sketch options** — list two or three approaches and note the trade-offs of each.\n\
         4. **Pick the smallest next step** — something you can finish today that reduces uncertainty.\n\n\
         > This reply was generated locally by the Local Preview model. Connect an AI provider \
         in Settings to get real answers.\n\n\
         Would you like me to expand on any of these steps?"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::test_support::CollectingSink;

    #[test]
    fn chunking_round_trips_text() {
        let text = "Hello  world\n\n- item one\n";
        let chunks = chunk(text);
        assert_eq!(chunks.concat(), text);
        assert_eq!(chunks[0], "Hello  ");
    }

    #[tokio::test]
    async fn streams_full_reply() {
        let provider = MockProvider::new(Duration::ZERO);
        let sink = CollectingSink::default();
        let messages = [ChatMessage {
            role: Role::User,
            content: "Plan a product launch".into(),
        }];
        let reason = provider
            .stream_chat(&messages, &sink, &CancelFlag::default())
            .await
            .unwrap();
        assert_eq!(reason, FinishReason::Stop);
        assert!(sink.text().contains("Plan a product launch"));
    }

    #[test]
    fn greets_on_greeting() {
        assert!(compose_reply("hello", 1).starts_with("Hello!"));
        assert!(!compose_reply("help me write", 1).starts_with("Hello!"));
    }
}
