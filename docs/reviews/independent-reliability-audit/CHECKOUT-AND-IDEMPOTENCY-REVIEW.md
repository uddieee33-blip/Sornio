# Checkout and idempotency

`payments.rs::prepare_retail` saves an exact serialized request, `post_retail` replays an identical durable operation and refuses conflicting input, and `clear_retail` acknowledges separately. Billing's `post_into` similarly compares committed request/payload before applying stock. Tests cover lost replies, exact retry, conflict, concurrent operations and subprocess termination before/after commit, but do not establish exactly-once for arbitrary callers, hardware power failure or every native command.

`CheckoutPanel.tsx` still suppresses F8/F2/F3/F4/Escape via `.lock-prompt, .reopen-prompt` selectors. Those classes currently exist. Added browser/native regression holds an unresolved pending sale, opens each prompt, sends F8, checks no new native post or invoice, verifies focus and restoration, and checks F8 during an in-flight post. No duplicate sale was reproduced. Selector coupling remains a maintenance risk; no speculative shortcut redesign was made.
