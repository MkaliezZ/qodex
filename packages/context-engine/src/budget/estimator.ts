/**
 * Qodex Context Engine — Token Budget Estimator
 *
 * Lightweight token estimation using a simple heuristic:
 * ~4 characters per token for English, ~2 for CJK.
 *
 * No model-specific tokenizer — this is an approximation.
 */

export class TokenEstimator {
  /**
   * Estimate the number of tokens in a text string.
   *
   * Approximation: count characters and divide by a heuristic factor.
   * - For text containing CJK characters: ~2 chars/token
   * - For ASCII-dominant text: ~4 chars/token
   */
  estimate(text: string): number {
    if (!text) return 0;

    let cjkCount = 0;
    let asciiCount = 0;

    for (const char of text) {
      const code = char.charCodeAt(0);
      // CJK Unified Ideographs + CJK Unified Ideographs Extension A
      if ((code >= 0x4E00 && code <= 0x9FFF) ||
          (code >= 0x3400 && code <= 0x4DBF)) {
        cjkCount++;
      } else if (code <= 0x7F) {
        asciiCount++;
      }
    }

    const cjkTokens = Math.ceil(cjkCount / 2);
    const asciiTokens = Math.ceil(asciiCount / 4);
    return cjkTokens + asciiTokens;
  }

  /**
   * Estimate tokens for multiple text sections and return total.
   */
  estimateTotal(sections: string[]): number {
    return sections.reduce((sum, s) => sum + this.estimate(s), 0);
  }
}
