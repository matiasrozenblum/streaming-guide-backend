
export class SimilarityUtil {
    /**
     * Calculate title similarity between program name and video title using a multi-strategy approach
     * Returns a percentage (0-1) indicating how similar the titles are
     * 
     * Strategy 1: Contains check - if video title contains program name (case-insensitive), return high score
     * Strategy 2: Jaccard similarity on words for general similarity
     * Strategy 3: Weighted average that favors containment
     */
    static calculateTitleSimilarity(programName: string, videoTitle: string): number {
        // Normalize accents and convert to lowercase for comparison
        const programLower = this.normalizeText(programName.toLowerCase().trim());
        const videoLower = this.normalizeText(videoTitle.toLowerCase().trim());

        // Strategy 1: Direct containment check
        // If video title contains the full program name, it's a strong match
        if (videoLower.includes(programLower) || programLower.includes(videoLower)) {
            return 0.7; // High score for containment
        }

        // Strategy 2: Check if video title contains significant words from program name
        // Count how many meaningful words from program name are in video title
        const programWords = programLower.split(/\s+/).filter(w => w.length > 2); // Ignore short words like "en", "la", etc.
        const meaningfulWordsMatched = programWords.filter(word => videoLower.includes(word)).length;
        const meaningfulWordsRatio = programWords.length > 0 ? meaningfulWordsMatched / programWords.length : 0;

        // If most meaningful words are found, it's a good match
        if (meaningfulWordsRatio >= 0.6) {
            return Math.min(0.8, 0.5 + (meaningfulWordsRatio * 0.5)); // Score between 0.5 and 0.8
        }

        // Strategy 3: Jaccard similarity for general word overlap (fallback)
        const allWords1 = new Set(programLower.split(/\s+/));
        const allWords2 = new Set(videoLower.split(/\s+/));
        const intersection = new Set([...allWords1].filter(x => allWords2.has(x)));
        const union = new Set([...allWords1, ...allWords2]);
        const jaccard = union.size > 0 ? intersection.size / union.size : 0;

        return jaccard;
    }

    /**
     * Normalize text by removing accents and special characters
     * This helps match titles with/without accents (e.g., "triángulo" vs "triangulo")
     */
    static normalizeText(text: string): string {
        return text
            .normalize('NFD') // Decompose accented characters
            .replace(/[\u0300-\u036f]/g, ''); // Remove accent marks
    }
}
