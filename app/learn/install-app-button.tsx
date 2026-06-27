"use client";

// Opens the iOS "Add to Home Screen" guide (handled globally by IosInstallGuide,
// which listens for the bt-open-ios-install event). Works on any device for preview.
export default function InstallAppButton() {
  function handleClick() {
    try { window.dispatchEvent(new Event("bt-open-ios-install")); } catch { /* ignore */ }
  }

  return (
    <button onClick={handleClick} className="bt-btn bt-btn-primary bt-btn-sm" style={{ marginTop: "10px" }}>
      Show me how →
    </button>
  );
}
