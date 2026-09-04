"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import type { NoteCaptureTarget } from "@/lib/note-capture";

export const NoteCaptureContext = React.createContext<((target: NoteCaptureTarget, selectedText?: string) => void) | null>(null);
export const NoteUpdatesContext = React.createContext(0);
export function AddStoryNoteButton({ target, disabled = false }: { target: NoteCaptureTarget; disabled?: boolean }) {
  const capture = React.useContext(NoteCaptureContext);
  return <Button type="button" variant="outline" size="sm" disabled={disabled || !capture} onClick={() => capture?.(target)}>Add note</Button>;
}

export function SelectionNoteButton({ target, manuscriptRef, hasSelection }: {
  target: NoteCaptureTarget; manuscriptRef: React.RefObject<HTMLTextAreaElement | null>; hasSelection: boolean;
}) {
  const capture = React.useContext(NoteCaptureContext);
  return <Button type="button" variant="outline" size="sm" disabled={!capture || !hasSelection}
    onClick={() => {
      const manuscript = manuscriptRef.current;
      if (!manuscript || manuscript.dataset.sceneId !== target.id) return;
      const text = manuscript.value.slice(manuscript.selectionStart, manuscript.selectionEnd);
      capture?.(target, text);
    }}>Add as Note</Button>;
}
