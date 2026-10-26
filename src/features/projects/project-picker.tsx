import type { ReactNode } from "react";
import { FolderMinus, FolderPlus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectDot } from "@/components/common/primitives";
import { navigationStore, useProjects } from "@/app/stores";

/** Dropdown for assigning an item to a project (or none). */
export function ProjectPicker({
  value,
  onChange,
  children,
  align = "end",
}: {
  value: string | null;
  onChange: (projectId: string | null) => void;
  children: ReactNode;
  align?: "start" | "end";
}) {
  const projects = useProjects((s) => s.projects);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuLabel>Move to Project</DropdownMenuLabel>
        {projects.length > 0 ? (
          <DropdownMenuRadioGroup value={value ?? ""} onValueChange={(v) => onChange(v || null)}>
            {projects.map((p) => (
              <DropdownMenuRadioItem key={p.id} value={p.id}>
                <ProjectDot color={p.color} />
                <span className="truncate">{p.name}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        ) : (
          <p className="px-2 py-1.5 text-[12px] text-muted-foreground">No projects yet.</p>
        )}
        <DropdownMenuSeparator />
        {value && (
          <DropdownMenuItem onSelect={() => onChange(null)}>
            <FolderMinus /> Remove from Project
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => navigationStore.getState().navigate({ page: "projects" })}>
          <FolderPlus /> Manage Projects…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
