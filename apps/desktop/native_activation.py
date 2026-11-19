"""UIA accessibility action for a real native WebView2 button.

This module knows nothing about product state; installed-app acceptance must
still prove the expected OS dialog, on-disk encrypted output and store data.
"""


class InvocationUnavailable(RuntimeError):
    """UIA cannot invoke this button; caller may use a keyboard fallback."""


def invoke_button(control):
    """Request a genuine UIA Invoke only for a visible, enabled control.

    The control's InvokePattern is an accessibility interface exposed by the
    installed application, not a direct API into Sornio's business logic.
    """
    if not control.is_visible() or not control.is_enabled():
        raise InvocationUnavailable("button is not visible and enabled")
    try:
        pattern = control.iface_invoke
        if pattern is None:
            raise InvocationUnavailable("UIA Invoke pattern is absent")
        pattern.Invoke()
    except InvocationUnavailable:
        raise
    except Exception as exc:
        raise InvocationUnavailable(f"UIA Invoke failed: {type(exc).__name__}") from exc
