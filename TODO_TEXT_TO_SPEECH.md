# Frontend-Only Text-To-Speech TODO

## Goal

Add browser-based text-to-speech for assistant chat replies using the Web Speech API `speechSynthesis`. Users should tap a speaker button on assistant messages to hear a reply aloud. Do not auto-play speech by default.

## Decisions

- Use frontend-only browser `speechSynthesis` first.
- Support web demo target first.
- Add manual playback only; no automatic reading of replies.
- Show playback controls only on assistant messages.
- Hide playback controls when text-to-speech is unsupported.
- Stop any current speech before starting a new message.
- Stop speech when the relevant component unmounts.
- Use existing bistro visual system and concise icon controls.

## 1. Type Definitions

- [x] Add text-to-speech types to `frontend/src/types/speech.ts`.
- [x] Define minimal browser speech synthesis types if needed:
  - [x] `SpeechSynthesisLike`
  - [x] `SpeechSynthesisUtteranceConstructor`
  - [x] `SpeechSynthesisUtteranceLike`
  - [x] `SpeechSynthesisErrorEventLike`
- [x] Add typed helper shape for:
  - [x] `window.speechSynthesis`
  - [x] `window.SpeechSynthesisUtterance`

## 2. Text-To-Speech Hook Tests

- [x] Add `frontend/tests/hooks/useTextToSpeech.test.tsx`.
- [x] Mock supported browser speech synthesis.
- [x] Test unsupported browser state.
- [x] Test `speak(text)` calls `speechSynthesis.speak`.
- [x] Test blank text does not call `speak`.
- [x] Test `speak(text)` cancels current speech before speaking new text.
- [x] Test `stop()` calls `speechSynthesis.cancel`.
- [x] Test `isSpeaking` becomes true on utterance start.
- [x] Test `isSpeaking` becomes false on utterance end.
- [x] Test utterance error maps to a useful message.
- [x] Test cleanup cancels speech on unmount.

## 3. Text-To-Speech Hook Implementation

- [x] Add `frontend/src/hooks/useTextToSpeech.ts`.
- [x] Detect `window.speechSynthesis` and `window.SpeechSynthesisUtterance`.
- [x] Expose:
  - [x] `supported`
  - [x] `isSpeaking`
  - [x] `error`
  - [x] `speak`
  - [x] `stop`
- [x] Configure utterance defaults:
  - [x] `lang = 'en-US'`
  - [x] `rate = 0.95`
  - [x] `pitch = 1`
- [x] Handle utterance `onstart`.
- [x] Handle utterance `onend`.
- [x] Handle utterance `onerror`.
- [x] Cancel existing speech before speaking a new message.
- [x] Cancel speech on unmount.
- [x] Log unexpected errors with context.

## 4. Chat Bubble Tests

- [x] Update or add `frontend/tests/components/ChatBubble.test.tsx`.
- [x] Mock `useTextToSpeech`.
- [x] Test speaker button renders for assistant messages.
- [x] Test speaker button does not render for user messages.
- [x] Test speaker button is hidden when unsupported.
- [x] Test pressing speaker calls `speak(message.content)`.
- [x] Test pressing active speaker calls `stop()`.
- [x] Test active speaking state changes accessibility label.
- [x] Test empty assistant message does not speak.

## 5. Chat Bubble Implementation

- [x] Modify `frontend/src/components/ChatBubble.tsx`.
- [x] Add compact speaker icon button on assistant bubbles.
- [x] Use `Ionicons` speaker icon.
- [x] Wire button to `useTextToSpeech`.
- [x] When idle, pressing button calls `speak(message.content)`.
- [x] When speaking, pressing button calls `stop()`.
- [x] Hide button for user messages.
- [x] Hide button when unsupported.
- [x] Add accessibility labels:
  - [x] `Read message aloud`
  - [x] `Stop reading message`
- [x] Add `testID` values for tests.

## 6. Playback UX

- [x] Do not auto-play new assistant messages.
- [x] Stop current speech before starting another message.
- [x] Keep button visually compact so bubbles remain readable.
- [x] Use `colors.text.secondary` or `colors.text.tertiary` for idle state.
- [x] Use `colors.brand.primary` for active speaking state.
- [x] Avoid adding visible instructional text.

## 7. Error Handling

- [x] Surface unsupported browser state gracefully by hiding controls.
- [x] Surface speech synthesis errors through `useToastStore`.
- [x] Do not leave button in active speaking state after an error.
- [x] Avoid silent failures.

## 8. Verification

- [x] Run `cd frontend && npm test -- useTextToSpeech`.
- [x] Run `cd frontend && npm test -- ChatBubble`.
- [x] Run `cd frontend && npm run typecheck`.
- [x] Run `cd frontend && npm run lint`.
- [x] Run `cd frontend && npm test -- --runInBand`.
- [x] Start web app with `cd frontend && npm run web`.
- [ ] Manually test in Chrome:
  - [ ] Send a chat message.
  - [ ] Wait for an assistant reply.
  - [ ] Tap speaker icon.
  - [ ] Confirm reply is read aloud.
  - [ ] Tap active speaker icon.
  - [ ] Confirm speech stops.
  - [ ] Tap speaker on another assistant message.
  - [ ] Confirm prior speech stops and new speech starts.
- [ ] Manually test unsupported fallback by removing mocked speech synthesis in browser dev tools or test harness.

## 9. Commit

- [ ] Commit tests and implementation after verification passes.
- [ ] Use imperative commit message, for example:
  - [ ] `Add text to speech for assistant replies`
