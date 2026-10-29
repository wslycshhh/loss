# Touchstone measurement comparison

This module imports public, generic or user-owned single-ended Touchstone v1 `.s2p` and `.s4p` data. It has no dependencies and performs no network access. Synthetic tests contain no customer measurement or mask values.

`parseTouchstone(text, portCount = 2)` returns `{portCount, referenceOhms, points:[{frequencyHz,s}]}`. The complex matrix is indexed as `s[outputPort-1][inputPort-1]`, with each value `{re,im}`. The option line supports Hz/kHz/MHz/GHz, S, RI/MA/DB and a positive common `R` resistance. Legal omitted options use the Touchstone defaults GHz/S/MA/50 ohms. Comments begin with `!`; complete complex pairs may continue onto following lines. Frequencies must be finite, nonnegative and strictly increasing. Unknown options, repeated option lines, incomplete data, v2 keywords and noise blocks cause explicit errors. No extra trailing data is silently dropped.

The [official IBIS Touchstone specification](https://www.ibis.org/touchstone_ver2.0/touchstone_ver2_0.pdf), pages 13 and 15–16, defines the original v1 formats: two-port order is S11, S21, S12, S22; four-port data is **row-wise** S11, S12, S13, S14, then S21, S22, S23, S24, and so on. Four-port data is not column-major. The published v2 specification documents both v1 and v2, but this importer intentionally rejects v2. Its acceptance of complete-pair line folding for two-port data is an import convenience beyond the original one-line v1 two-port layout. Noise records are unsupported.

`deriveMetrics(parsed, {inputPlus, inputMinus, outputPlus, outputMinus, mappingConfirmed, referencePlane})` requires explicit `mappingConfirmed:true` and a nonblank, user-confirmed reference-plane name. No reference plane is inferred from a filename or comments. For two-port data, input/output default to 1/2, and S21/S11 are used. Four-port data requires all four distinct physical port numbers and polarity confirmation. For input +1/-3 and output +2/-4:

```
Sdd21 = (S21 - S23 - S41 + S43) / 2
Sdd11 = (S11 - S13 - S31 + S33) / 2
```

The operations use complex values before taking magnitude. The returned `{referencePlane, referenceOhms, metricFamily, points:[{fGHz,ilDb,rlDb}]}` uses signed S-parameter decibels, `20 log10(|S|)`, rather than positive loss. Exact zero yields JavaScript `-Infinity`; an export layer must represent this explicitly rather than silently converting it to JSON `null`.

The parser preserves the file's common reference resistance. This initial derivation path accepts only 50 ohm single-ended source data: `.s2p` stays 50 ohms, and `.s4p` differential data is referenced to 100 ohms. Other reference resistances are rejected at derivation; no impedance renormalization or de-embedding is performed. The differential conversion assumes equal single-ended port resistances and uses twice that resistance for differential mode, as described on pages 19–20 and in Appendix A of the same official specification. Port pairing and polarity are physical facts that the user must check.

`compareMeasurement(metrics, mask, evaluateMask)` compares one engine mask. The mask supplies `metric` (`S21`, `Sdd21`, `S11`, `Sdd11`), `comparison` (`min`/`max`), `referencePlane`, `referenceOhms`, `verificationStatus` and its frequency segments. The supplied engine evaluator is called only at measured source frequencies and returns `{status:'OK'|'TBD',signedDb,...}`. For `min`, margin is measured minus mask; for `max`, margin is mask minus measured. A negative margin means exceedance. The returned `{status,points,worstMarginDb,warning,reason?}` preserves source frequencies and reports each point's `measuredDb`, `maskDb`, `marginDb` and `status`.

Only a `verified_public` mask with matching explicit reference plane, impedance and metric family can produce overall `measured_pass`. Unverified/missing masks, unmatched metadata, empty measurements or points without a valid in-band mask comparison return `TBD`; valid numerical comparisons may still be retained for review. A valid exceedance takes precedence over missing frequency coverage for a verified mask. No frequency interpolation, extrapolation, smoothing, conversion between single-ended/differential masks or automatic reference-plane matching is done.

**A measured pass means only that the imported measured points satisfy this mask. It does not establish compliance between points, over an entire continuous curve, or beyond the measured/mask bands.** Calibration, reference-plane placement, de-embedding, measurement uncertainty, mapping correctness and suitability of the selected mask remain external measurement responsibilities.

Run the synthetic checks with `node --test tests/touchstone.test.mjs` from the app directory.
