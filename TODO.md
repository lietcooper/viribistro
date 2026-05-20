# Frontend-Only Speech-To-Text TODO

## Goal

Add browser-based speech-to-text to the Chat input using the Web Speech API. The dictated text should fill the input, and the user must tap Send manually.

## Decisions

- Use frontend-only Web Speech API first.
- Support web demo target first.
- Do not auto-send dictated text.
- Hide or disable voice input when speech recognition is unsupported.
- Disable voice input while the AI is typing.
- Use existing bistro visual system and Reanimated for listening feedback.

## 1. Type Definitions

- [x] Add `frontend/src/types/speech.ts`.
- [x] Define minimal browser speech types:
  - [x] `SpeechRecognition`
  - [x] `SpeechRecognitionConstructor`
  - [x] `SpeechRecognitionEvent`
  - [x] `SpeechRecognitionErrorEvent`
- [x] Add a typed helper shape for `window.SpeechRecognition` and `window.webkitSpeechRecognition`.

## 2. Speech Hook Tests

- [x] Add `frontend/tests/hooks/useSpeechToText.test.tsx`.
- [x] Mock a supported browser speech recognition implementation.
- [x] Test unsupported browser state.
- [x] Test `startListening()` starts recognition.
- [x] Test `stopListening()` stops recognition.
- [x] Test `onresult` stores interim transcript.
- [x] Test `onresult` stores final transcript.
- [x] Test `resetTranscript()` clears transcript state.
- [x] Test permission-denied error maps to a useful message.
- [x] Test cleanup stops recognition on unmount.

## 3. Speech Hook Implementation

- [x] Add `frontend/src/hooks/useSpeechToText.ts`.
- [x] Detect `window.SpeechRecognition || window.webkitSpeechRecognition`.
- [x] Expose:
  - [x] `supported`
  - [x] `isListening`
  - [x] `transcript`
  - [x] `interimTranscript`
  - [x] `error`
  - [x] `startListening`
  - [x] `stopListening`
  - [x] `resetTranscript`
- [x] Configure recognition:
  - [x] `continuous = false`
  - [x] `interimResults = true`
  - [x] `lang = 'en-US'`
- [x] Handle `onstart`.
- [x] Handle `onresult`.
- [x] Handle `onerror`.
- [x] Handle `onend`.
- [x] Remove event handlers and stop recognition on unmount.
- [x] Log unexpected errors with context.

## 4. Chat Input Tests

- [x] Update `frontend/tests/components/ChatInput.test.tsx`.
- [x] Test mic button renders when speech recognition is supported.
- [x] Test mic button is hidden or disabled when unsupported.
- [x] Test pressing mic starts listening.
- [x] Test pressing mic again stops listening.
- [x] Test listening state changes accessibility label.
- [x] Test final transcript fills the text input.
- [x] Test interim transcript is visible while listening.
- [x] Test Send uses dictated text.
- [x] Test mic is disabled when Chat input is disabled.

## 5. Chat Input Implementation

- [x] Modify `frontend/src/components/ChatInput.tsx`.
- [x] Add mic icon button beside Send.
- [x] Use `Ionicons` mic icon.
- [x] Wire mic button to `useSpeechToText`.
- [x] On final transcript, populate the input text.
- [x] Show interim transcript without sending it automatically.
- [x] Stop listening after Send.
- [x] Stop listening when component unmounts.
- [x] Add accessibility labels:
  - [x] `Start voice input`
  - [x] `Stop voice input`
- [x] Add `testID` values for tests.

## 6. Listening Animation

- [x] Add Reanimated pulse/ring around mic while listening.
- [x] Use `colors.brand.primary` for active listening.
- [x] Use `colors.text.tertiary` for idle state.
- [x] Use `colors.error` for speech errors if shown inline.
- [x] Respect reduced motion if available.

## 7. Error Handling

- [x] Surface permission-denied errors through `useToastStore`.
- [x] Surface no-speech errors with a concise message.
- [x] Surface unsupported browser state gracefully.
- [x] Do not leave the mic in listening state after an error.
- [x] Avoid silent failures.

## 8. Verification

- [x] Run `cd frontend && npm test -- useSpeechToText`.
- [x] Run `cd frontend && npm test -- ChatInput`.
- [x] Run `cd frontend && npm run typecheck`.
- [x] Run `cd frontend && npm run lint`.
- [ ] Start web app with `cd frontend && npm run web`.
- [ ] Manually test in Chrome:
  - [ ] Click mic.
  - [ ] Allow microphone permission.
  - [ ] Say “Add a burger”.
  - [ ] Confirm text appears in input.
  - [ ] Tap Send manually.
  - [ ] Confirm AI flow still works.
- [ ] Manually test unsupported fallback by removing mocked speech API in browser dev tools or test harness.

## 9. Commit

- [ ] Commit tests and implementation after verification passes.
- [ ] Use imperative commit message, for example:
  - [ ] `Add browser speech input to chat`
