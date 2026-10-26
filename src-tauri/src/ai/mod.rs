//! Provider-agnostic AI layer. The webview only ever sees provider metadata and
//! streamed events; credentials and network calls stay in this process.

pub mod mock;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::db::conversations::Role;
use crate::error::{AppError, AppResult};

const MAX_REQUEST_MESSAGES: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub role: Role,
    pub content: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub request_id: String,
    pub provider_id: Option<String>,
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FinishReason {
    Stop,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum StreamEvent {
    Started { provider_id: String, model: String },
    Delta { text: String },
    Completed { finish_reason: FinishReason },
    Error { message: String },
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderStatus {
    Ready,
    #[allow(dead_code, reason = "reported by remote providers until credentials are stored")]
    NeedsConfiguration,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub model: String,
    pub is_local: bool,
    pub status: ProviderStatus,
}

/// Receives streamed events. Returns `false` once the receiver has gone away.
pub trait EventSink: Send + Sync {
    fn emit(&self, event: StreamEvent) -> bool;
}

#[derive(Clone, Default)]
pub struct CancelFlag(Arc<AtomicBool>);

impl CancelFlag {
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

#[async_trait]
pub trait AiProvider: Send + Sync {
    fn info(&self) -> ProviderInfo;

    /// Streams a reply as `Delta` events. `Started`/`Completed`/`Error` framing
    /// is emitted by the registry so every provider behaves consistently.
    async fn stream_chat(
        &self,
        messages: &[ChatMessage],
        sink: &dyn EventSink,
        cancel: &CancelFlag,
    ) -> AppResult<FinishReason>;
}

pub struct AiRegistry {
    providers: Vec<Arc<dyn AiProvider>>,
    in_flight: Mutex<HashMap<String, CancelFlag>>,
}

impl AiRegistry {
    pub fn new(providers: Vec<Arc<dyn AiProvider>>) -> Self {
        assert!(!providers.is_empty(), "at least one AI provider is required");
        Self {
            providers,
            in_flight: Mutex::new(HashMap::new()),
        }
    }

    pub fn providers(&self) -> Vec<ProviderInfo> {
        self.providers.iter().map(|p| p.info()).collect()
    }

    fn resolve(&self, id: Option<&str>) -> AppResult<Arc<dyn AiProvider>> {
        match id {
            None => Ok(self.providers[0].clone()),
            Some(id) => self
                .providers
                .iter()
                .find(|p| p.info().id == id)
                .cloned()
                .ok_or(AppError::NotFound("AI provider")),
        }
    }

    fn validate(request: &ChatRequest) -> AppResult<()> {
        if request.request_id.is_empty() || request.request_id.len() > 64 {
            return Err(AppError::InvalidInput("invalid request id".into()));
        }
        if request.messages.is_empty() || request.messages.len() > MAX_REQUEST_MESSAGES {
            return Err(AppError::InvalidInput(
                "request must contain between 1 and 500 messages".into(),
            ));
        }
        Ok(())
    }

    /// Runs a streaming request to completion, emitting framed events to `sink`.
    pub async fn stream(&self, request: ChatRequest, sink: &dyn EventSink) -> AppResult<()> {
        Self::validate(&request)?;
        let provider = self.resolve(request.provider_id.as_deref())?;
        let info = provider.info();
        if info.status != ProviderStatus::Ready {
            return Err(AppError::Provider(format!("{} is not configured", info.name)));
        }

        let flag = CancelFlag::default();
        {
            let mut in_flight = self.lock()?;
            if in_flight.contains_key(&request.request_id) {
                return Err(AppError::InvalidInput("duplicate request id".into()));
            }
            in_flight.insert(request.request_id.clone(), flag.clone());
        }

        sink.emit(StreamEvent::Started {
            provider_id: info.id,
            model: info.model,
        });
        let result = provider.stream_chat(&request.messages, sink, &flag).await;
        self.lock()?.remove(&request.request_id);

        match result {
            Ok(finish_reason) => sink.emit(StreamEvent::Completed { finish_reason }),
            Err(err) => sink.emit(StreamEvent::Error {
                message: err.to_string(),
            }),
        };
        Ok(())
    }

    /// Signals cancellation. Returns whether a matching request was in flight.
    pub fn cancel(&self, request_id: &str) -> AppResult<bool> {
        Ok(self.lock()?.get(request_id).map(CancelFlag::cancel).is_some())
    }

    fn lock(&self) -> AppResult<std::sync::MutexGuard<'_, HashMap<String, CancelFlag>>> {
        self.in_flight
            .lock()
            .map_err(|_| AppError::Internal("AI registry lock poisoned".into()))
    }
}

#[cfg(test)]
pub(crate) mod test_support {
    use super::*;

    #[derive(Default)]
    pub struct CollectingSink(pub Mutex<Vec<StreamEvent>>);

    impl EventSink for CollectingSink {
        fn emit(&self, event: StreamEvent) -> bool {
            self.0.lock().unwrap().push(event);
            true
        }
    }

    impl CollectingSink {
        pub fn events(&self) -> Vec<StreamEvent> {
            self.0.lock().unwrap().clone()
        }

        pub fn text(&self) -> String {
            self.events()
                .into_iter()
                .filter_map(|e| match e {
                    StreamEvent::Delta { text } => Some(text),
                    _ => None,
                })
                .collect()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::CollectingSink;
    use super::*;
    use std::time::Duration;

    fn registry(delay: Duration) -> AiRegistry {
        AiRegistry::new(vec![Arc::new(mock::MockProvider::new(delay))])
    }

    fn request(id: &str, content: &str) -> ChatRequest {
        ChatRequest {
            request_id: id.into(),
            provider_id: None,
            messages: vec![ChatMessage {
                role: Role::User,
                content: content.into(),
            }],
        }
    }

    #[tokio::test]
    async fn frames_stream_with_started_and_completed() {
        let registry = registry(Duration::ZERO);
        let sink = CollectingSink::default();
        registry.stream(request("r1", "Hello"), &sink).await.unwrap();
        let events = sink.events();
        assert!(matches!(events.first(), Some(StreamEvent::Started { .. })));
        assert_eq!(
            events.last(),
            Some(&StreamEvent::Completed {
                finish_reason: FinishReason::Stop
            })
        );
        assert!(!sink.text().is_empty());
    }

    #[tokio::test]
    async fn provider_errors_become_error_events() {
        let registry = registry(Duration::ZERO);
        let sink = CollectingSink::default();
        registry
            .stream(request("r2", "please /error"), &sink)
            .await
            .unwrap();
        assert!(matches!(sink.events().last(), Some(StreamEvent::Error { .. })));
    }

    #[tokio::test]
    async fn cancellation_stops_stream() {
        let registry = Arc::new(registry(Duration::from_millis(5)));
        let sink = Arc::new(CollectingSink::default());
        let task = {
            let (registry, sink) = (registry.clone(), sink.clone());
            tokio::spawn(async move { registry.stream(request("r3", "Tell me"), &*sink).await })
        };
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert!(registry.cancel("r3").unwrap());
        task.await.unwrap().unwrap();
        assert_eq!(
            sink.events().last(),
            Some(&StreamEvent::Completed {
                finish_reason: FinishReason::Cancelled
            })
        );
        assert!(!registry.cancel("r3").unwrap());
    }

    #[tokio::test]
    async fn rejects_invalid_requests() {
        let registry = registry(Duration::ZERO);
        let sink = CollectingSink::default();
        let mut empty = request("r4", "x");
        empty.messages.clear();
        assert!(registry.stream(empty, &sink).await.is_err());
        let mut unknown = request("r5", "x");
        unknown.provider_id = Some("nope".into());
        assert!(registry.stream(unknown, &sink).await.is_err());
        assert!(sink.events().is_empty());
    }
}
