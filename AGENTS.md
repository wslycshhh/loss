# loss repository

Keep the implementation small and data driven. Validate imported data at the boundary; never execute rule expressions. Every nontrivial change should retain a focused runnable check.

Use only verified public source data or clearly labeled synthetic fixtures in this repository. Keep supplier-restricted documents, rules, source screenshots and internal reports outside the Git worktree and outside build inputs. Local import does not authorize publication.

Do not confuse payload, per-physical-link bitrate, symbol rate and Nyquist. Deserializer video-output count never halves a physical SerDes link. Never extrapolate masks, add return-loss dB, or claim hardware compliance from a software budget.

Run npm test, npm run build and npm run audit:public before publication. Preserve source discrepancies and label unresolved combinations TBD.
