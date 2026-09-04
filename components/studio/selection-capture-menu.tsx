"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { MapPin, StickyNote, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoteCaptureContext } from "./note-capture";
import type { NoteCaptureTarget } from "@/lib/note-capture";

export type ManuscriptSelection = { sceneId: string; start: number; end: number };

type FloatingPosition = { left: number; top: number; placement: "above" | "below" };

function getTextareaSelectionRect(input: HTMLTextAreaElement, start: number, end: number) {
  const inputRect = input.getBoundingClientRect();
  const style = window.getComputedStyle(input);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  const copiedProperties = [
    "borderBottomWidth", "borderLeftWidth", "borderRightWidth", "borderTopWidth",
    "boxSizing", "fontFamily", "fontSize", "fontStyle", "fontVariant", "fontWeight",
    "letterSpacing", "lineHeight", "paddingBottom", "paddingLeft", "paddingRight", "paddingTop",
    "tabSize", "textAlign", "textIndent", "textTransform", "wordSpacing"
  ] as const;

  mirror.style.position = "fixed";
  mirror.style.left = "0";
  mirror.style.top = "0";
  mirror.style.width = `${input.offsetWidth}px`;
  mirror.style.height = "auto";
  mirror.style.minHeight = "0";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.wordWrap = "break-word";
  copiedProperties.forEach((property) => { mirror.style[property] = style[property]; });

  mirror.append(document.createTextNode(input.value.slice(0, start)));
  marker.textContent = input.value.slice(start, end) || "\u200b";
  mirror.append(marker, document.createTextNode(input.value.slice(end) || "\u200b"));
  document.body.append(mirror);

  const mirrorRect = mirror.getBoundingClientRect();
  const fragments = Array.from(marker.getClientRects()).filter((rect) => rect.width || rect.height);
  const first = fragments[0] ?? marker.getBoundingClientRect();
  const last = fragments.at(-1) ?? first;
  const translateX = inputRect.left - mirrorRect.left - input.scrollLeft;
  const translateY = inputRect.top - mirrorRect.top - input.scrollTop;
  const result = {
    left: Math.max(inputRect.left, Math.min(first.left + translateX, inputRect.right)),
    right: Math.max(inputRect.left, Math.min(last.right + translateX, inputRect.right)),
    top: Math.max(inputRect.top, Math.min(first.top + translateY, inputRect.bottom)),
    bottom: Math.max(inputRect.top, Math.min(last.bottom + translateY, inputRect.bottom))
  };
  mirror.remove();
  return result;
}

export function SelectionCaptureMenu({ target, manuscriptRef, selection, onRefresh, onNotify }: {
  target: NoteCaptureTarget;
  manuscriptRef: React.RefObject<HTMLTextAreaElement | null>;
  selection: ManuscriptSelection;
  onRefresh: () => void;
  onNotify: (message: string) => void;
}) {
  const captureNote = React.useContext(NoteCaptureContext);
  const menuRef = React.useRef<HTMLElement | null>(null);
  const firstActionRef = React.useRef<HTMLButtonElement | null>(null);
  const lastActionRef = React.useRef<HTMLButtonElement | null>(null);
  const busy = React.useRef(false);
  const mounted = React.useRef(true);
  const [pending, setPending] = React.useState<"Character" | "Place" | null>(null);
  const [error, setError] = React.useState("");
  const [dismissed, setDismissed] = React.useState(false);
  const [position, setPosition] = React.useState<FloatingPosition | null>(null);
  const active = !dismissed && selection.sceneId === target.id && selection.end > selection.start && Boolean(manuscriptRef.current?.value.slice(selection.start, selection.end).trim());
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const focusEditor = React.useCallback((preserveSelection: boolean) => {
    requestAnimationFrame(() => {
      const input = manuscriptRef.current;
      if (input?.dataset.sceneId !== target.id) return;
      const scrollTop = input.scrollTop;
      const scrollLeft = input.scrollLeft;
      input.focus({ preventScroll: true });
      const caret = preserveSelection ? selection.start : selection.end;
      input.setSelectionRange(caret, preserveSelection ? selection.end : caret);
      input.scrollTop = scrollTop;
      input.scrollLeft = scrollLeft;
    });
  }, [manuscriptRef, selection.end, selection.start, target.id]);

  const selectedText = React.useCallback((maximum: number, trim: boolean) => {
    const input = manuscriptRef.current;
    if (!input || input.dataset.sceneId !== target.id || selection.end <= selection.start) return null;
    const raw = input.value.slice(selection.start, selection.end).normalize("NFC");
    const text = trim ? raw.trim() : raw;
    return text.trim() && text.length <= maximum ? text : null;
  }, [manuscriptRef, selection.end, selection.start, target.id]);

  const dismiss = React.useCallback((returnFocus = false) => {
    setDismissed(true);
    setError("");
    if (returnFocus) focusEditor(true);
  }, [focusEditor]);

  const updatePosition = React.useCallback(() => {
    const input = manuscriptRef.current;
    const menu = menuRef.current;
    if (!active || !input || !menu || input.dataset.sceneId !== target.id) return;
    const anchor = getTextareaSelectionRect(input, selection.start, selection.end);
    const menuRect = menu.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportRight = viewportLeft + (viewport?.width ?? window.innerWidth);
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
    const inputRect = input.getBoundingClientRect();
    const margin = 8;
    const gap = 10;
    const placement = anchor.top - menuRect.height - gap >= viewportTop + margin ? "above" : "below";
    const desiredTop = placement === "above" ? anchor.top - menuRect.height - gap : anchor.bottom + gap;
    const anchorCenter = (anchor.left + anchor.right) / 2;
    const editorHasRoom = inputRect.width >= menuRect.width + margin * 2;
    const minimumLeft = editorHasRoom ? Math.max(viewportLeft + margin, inputRect.left) : viewportLeft + margin;
    const maximumRight = editorHasRoom ? Math.min(viewportRight - margin, inputRect.right) : viewportRight - margin;
    setPosition({
      placement,
      left: Math.min(Math.max(anchorCenter - menuRect.width / 2, minimumLeft), maximumRight - menuRect.width),
      top: Math.min(Math.max(desiredTop, viewportTop + margin), viewportBottom - menuRect.height - margin)
    });
  }, [active, manuscriptRef, selection.end, selection.start, target.id]);

  React.useLayoutEffect(() => {
    if (!active) return;
    updatePosition();
    const frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [active, updatePosition]);

  React.useEffect(() => {
    if (!active) return;
    const reposition = () => updatePosition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.visualViewport?.addEventListener("resize", reposition);
    window.visualViewport?.addEventListener("scroll", reposition);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.visualViewport?.removeEventListener("resize", reposition);
      window.visualViewport?.removeEventListener("scroll", reposition);
    };
  }, [active, updatePosition]);

  React.useEffect(() => {
    if (!active) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) dismiss(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss(true);
        return;
      }
      const input = manuscriptRef.current;
      if (event.key === "Tab" && document.activeElement === input) {
        event.preventDefault();
        (event.shiftKey ? lastActionRef.current : firstActionRef.current)?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [active, dismiss, manuscriptRef]);

  const create = async (type: "Character" | "Place") => {
    if (busy.current) return;
    const name = selectedText(120, true);
    if (!name) {
      setError("Select 1–120 characters for a name.");
      focusEditor(true);
      return;
    }
    busy.current = true;
    setPending(type);
    setError("");
    try {
      const response = await fetch("/api/quick-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ novelId: target.novelId, sceneId: target.id, kind: type, name })
      });
      if (!response.ok) throw new Error();
      setDismissed(true);
      onRefresh();
      onNotify(`${type} '${name}' created`);
      if (mounted.current) focusEditor(false);
    } catch {
      setError(`Could not create ${type.toLowerCase()}. The manuscript was not changed.`);
      if (mounted.current) focusEditor(true);
    } finally {
      setPending(null);
      busy.current = false;
    }
  };

  const createNote = () => {
    const text = selectedText(100000, false);
    if (!text) {
      setError("Select 1–100,000 characters to create a note.");
      focusEditor(true);
      return;
    }
    setDismissed(true);
    manuscriptRef.current?.focus({ preventScroll: true });
    captureNote?.(target, text);
  };

  if (!active || typeof document === "undefined") return null;
  const keepEditorSelection = (event: React.MouseEvent) => event.preventDefault();

  return createPortal(
    <section
      ref={menuRef}
      role="toolbar"
      aria-label="Quick capture selected text"
      data-placement={position?.placement}
      className="fixed z-[70] flex max-w-[calc(100vw-1rem)] flex-wrap items-center gap-1 rounded-lg border border-border/80 bg-popover p-1.5 text-popover-foreground shadow-lift"
      style={{ left: position?.left ?? 8, top: position?.top ?? 8, visibility: position ? "visible" : "hidden" }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          dismiss(true);
        } else if (event.key === "Tab" && event.shiftKey && event.target === firstActionRef.current) {
          event.preventDefault();
          dismiss(true);
        } else if (event.key === "Tab" && !event.shiftKey && event.target === lastActionRef.current) {
          event.preventDefault();
          dismiss(true);
        }
      }}
    >
      <Button ref={firstActionRef} type="button" size="sm" variant="ghost" disabled={Boolean(pending)} onMouseDown={keepEditorSelection} onClick={() => void create("Character")}>
        <UserRound aria-hidden="true" /> {pending === "Character" ? "Creating…" : "Character"}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={Boolean(pending)} onMouseDown={keepEditorSelection} onClick={() => void create("Place")}>
        <MapPin aria-hidden="true" /> {pending === "Place" ? "Creating…" : "Place"}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={Boolean(pending) || !captureNote} onMouseDown={keepEditorSelection} onClick={createNote}>
        <StickyNote aria-hidden="true" /> Note
      </Button>
      <Button ref={lastActionRef} type="button" size="icon" variant="ghost" aria-label="Close quick capture" className="size-8 min-h-8" onMouseDown={keepEditorSelection} onClick={() => dismiss(true)}>
        <X aria-hidden="true" />
      </Button>
      {error ? <p role="alert" className="basis-full px-2 pb-1 text-sm text-destructive">{error}</p> : null}
    </section>,
    document.body
  );
}
