# YYC Node.js ID-Card Orchestrator

Node.js is used here for the server-side orchestration layer around the Python image renderer.

Flow:
Node.js request validation -> bounded file paths -> Python renderer -> final PNG

Why Node.js belongs here:
- It is already part of the YYC automation and CI toolchain.
- It is suited to API and request orchestration.
- It keeps request validation separate from Python image processing.
- It uses only Node built-in modules, so no new npm dependency is required.

Safety boundary:
- This module is not imported by index.html.
- It does not replace the current browser ID-card UI.
- It never generates or modifies a member's face.
- File paths are constrained to the repository root before Python is called.
- A role number is required before rendering.
- The QR verification URL is passed explicitly to the deterministic Python renderer.

This service is intentionally not deployed as a public API yet. It can be placed behind Render later after the final master ID-card artwork and field coordinates are locked.
