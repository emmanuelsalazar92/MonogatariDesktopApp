"use client";
import * as React from "react";
import { listNoteDrafts, storeNoteDraft, removeNoteDraft, noteDraftConflict, type NoteDraft, type NoteDraftFields } from "@/lib/note-draft";

export function useNoteDraft({ novelId, noteId, revision, fields, baseline, onRestore }: {
  novelId: string; noteId: string | null; revision: number | null; fields: NoteDraftFields; baseline: NoteDraftFields; onRestore: (fields: NoteDraftFields) => void;
}) {
  const [candidates, setCandidates] = React.useState<NoteDraft[]>([]), [ready, setReady] = React.useState(false);
  const [message, setMessage] = React.useState(""), [savedAt, setSavedAt] = React.useState<number | null>(null);
  const [conflict, setConflict] = React.useState(false), [discarding, setDiscarding] = React.useState(false);
  const session = React.useRef<string | null>(null), owned = React.useRef<NoteDraft | null>(null), recovered = React.useRef<NoteDraft | null>(null);
  const complete = React.useRef(false), attempted = React.useRef(false), baseRevision = React.useRef(revision), lastWritten = React.useRef("");
  const signature = JSON.stringify(fields), dirty = signature !== JSON.stringify(baseline);
  const live = React.useRef({ fields, dirty, candidates, ready });
  live.current = { fields, dirty, candidates, ready };
  const persist = React.useCallback((notify = true) => {
    if (complete.current || !live.current.ready || live.current.candidates.length) return true;
    if (!live.current.dirty) {
      try {
        if (owned.current && !removeNoteDraft(window.localStorage, owned.current)) return false;
        owned.current = null; lastWritten.current = "";
        if (notify) setSavedAt(null);
        return true;
      } catch { if (notify) setMessage("Could not clear the local draft. Please retry before leaving."); return false; }
    }
    const fingerprint = JSON.stringify({ fields: live.current.fields, attempted: attempted.current, baseRevision: baseRevision.current });
    if (fingerprint === lastWritten.current) return true;
    try {
      session.current ??= Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
      const draft: NoteDraft = { version: 1, sessionId: session.current, novelId, noteId, baseRevision: baseRevision.current, attemptedSave: attempted.current, savedAt: Date.now(), fields: live.current.fields };
      storeNoteDraft(window.localStorage, draft); owned.current = draft; lastWritten.current = fingerprint;
      if (notify) { setSavedAt(draft.savedAt); setMessage(""); }
      return true;
    } catch { if (notify) setMessage("Local draft could not be saved (storage unavailable, full or limit reached). Keep this window open, save manually, or copy your text before leaving."); return false; }
  }, [novelId, noteId]);
  React.useEffect(() => {
    try { setCandidates(listNoteDrafts(window.localStorage, novelId, noteId)); }
    catch { setMessage("Local draft recovery is unavailable in this browser. Keep a copy of your text."); }
    setReady(true);
  }, [novelId, noteId]);
  React.useEffect(() => {
    if (!ready || candidates.length) return;
    const timer = setTimeout(() => persist(), 1200);
    return () => clearTimeout(timer);
  }, [signature, ready, candidates.length, dirty, persist]);
  React.useEffect(() => {
    const interval = setInterval(() => persist(), 10000);
    const hidden = () => { if (document.visibilityState === "hidden") persist(false); };
    const unload = (event: BeforeUnloadEvent) => { if (!persist(false)) { event.preventDefault(); event.returnValue = ""; } };
    const pagehide = () => { persist(false); };
    document.addEventListener("visibilitychange", hidden); window.addEventListener("pagehide", pagehide); window.addEventListener("beforeunload", unload);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", hidden); window.removeEventListener("pagehide", pagehide); window.removeEventListener("beforeunload", unload); persist(false); };
  }, [persist]);
  const cleanup = () => {
    let ok = true;
    for (const draft of [owned.current, recovered.current]) if (draft) {
      try { if (!removeNoteDraft(window.localStorage, draft)) ok = false; } catch { ok = false; }
    }
    return ok;
  };
  return { dirty, ready, candidates, message, savedAt: owned.current && JSON.stringify(owned.current.fields) === signature ? savedAt : null, conflict, discarding, setDiscarding,
    persist: () => persist(),
    recover(draft: NoteDraft) {
      recovered.current = draft; baseRevision.current = draft.baseRevision; attempted.current = draft.attemptedSave;
      setConflict(noteDraftConflict(draft, revision)); onRestore(draft.fields); setCandidates([]); setSavedAt(null);
    },
    continueCurrent() { setCandidates([]); },
    discardCandidate(draft: NoteDraft) {
      try {
        if (!removeNoteDraft(window.localStorage, draft)) { setMessage("This draft changed in another tab. Reopen to review its latest version."); return; }
        setCandidates(current => current.filter(item => item.sessionId !== draft.sessionId));
      } catch { setMessage("Could not remove the local draft. Please retry."); }
    },
    acceptCurrentRevision() { baseRevision.current = revision; setConflict(false); },
    discard() {
      if (!cleanup()) { setMessage("Could not remove a draft, or it changed in another tab. Reopen to review it."); return; }
      owned.current = null; recovered.current = null; attempted.current = false; lastWritten.current = "";
      baseRevision.current = revision; onRestore(baseline); live.current.dirty = false; setSavedAt(null); setMessage(""); setConflict(false); setDiscarding(false);
    },
    markAttempt() { attempted.current = true; persist(); },
    markSaved() { complete.current = true; return cleanup(); }
  };
}
