// Web: close Firestore when the page is discarded, before the browser aborts its requests.
//
// Why (BUDG-8 lane X, trace in deliverables/BUDG-8/lane-X/round4): a navigation or reload while
// Firestore's WebChannel handshake is in flight aborts that request; the WebChannel layer
// (@firebase/webchannel-wrapper, error 2 REQUEST_FAILED, no retry while the channel is opening)
// then loads https://www.google.com/images/cleardot.gif as a connectivity probe from the dying
// page. Firestore exposes no setting for that probe. A channel that was closed first ignores the
// aborted request, so no probe is sent. terminate() writes nothing.
//
// A pagehide with `persisted` true enters the back/forward cache and may come back: left alone.

type PageHideTarget = {
  addEventListener(type: 'pagehide', listener: (event: { persisted: boolean }) => void): void;
};

export function closeOnPageDiscard(target: PageHideTarget, close: () => Promise<void>) {
  target.addEventListener('pagehide', (event) => {
    if (!event.persisted) void close().catch(() => undefined);
  });
}
