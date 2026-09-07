# Pending feedback

Navigation uses `usePendingNavigation` and `NavigationFeedback` from
`components/studio/pending-navigation.tsx`. Call `begin(label)` before any
save, selection update, or document read that precedes a route change. It
returns `false` when the same navigation is already in progress. Call
`finish()` on failure; a successful route change clears the state from the
pathname/search-param effect. Route writes use `React.startTransition`.

The shared indicator is a compact, delayed visual status so fast route changes
do not flicker, but it never delays navigation. It uses a polite live region;
the spinner is decorative. The workspace root exposes `aria-busy` while this
state is active.

Covered paths include Sidebar and mobile navigation, Library project actions,
Continue writing, Overview workspace links, Reader navigation, and opening a
scene after its document is loaded. Existing Save controls retain their
confirmed `Saving…`/retry states. Notion push and pull additionally use
in-flight refs, disabled controls, and contextual labels to prevent duplicate
requests while allowing the rest of the workspace to remain usable.

For a new non-idempotent async action, prefer its existing component-level
pending state when it already owns the request. Otherwise use a ref as the
immediate duplicate guard, clear it in `finally`, and expose a text label plus
`aria-busy` on the control. Do not add artificial timers or full-screen
loading overlays.
