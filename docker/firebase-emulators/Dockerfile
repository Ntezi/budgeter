# Firebase Auth + Firestore emulators for local tests only (BUDG-1, ADR-2).
# No credentials, no ~/.config mount; the demo-* project never reaches Google.
# trixie + JRE 21: the Firestore emulator in firebase-tools 14 needs Java 21+.
FROM node:22-trixie-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends openjdk-21-jre-headless \
  && rm -rf /var/lib/apt/lists/*
ENV NO_UPDATE_NOTIFIER=1 FIREBASE_CLI_DISABLE_UPDATE_CHECK=1
RUN npm install -g firebase-tools@14.17.0 \
  && firebase setup:emulators:firestore \
  && firebase setup:emulators:ui
WORKDIR /workspace
EXPOSE 9099 8080 4000
CMD ["firebase", "emulators:start", "--project", "demo-budgeta", "--config", "firebase.emulators.json"]
