// Parameters:
// - $id: Unique memory identifier string
// - $kind: Memory type ("semantic", "procedural", or "episodic")
// - $polarity: Memory polarity ("positive" or "negative")
// - $title: Memory title string
// - $content: Memory content/description string
// - $contentHash: SHA-256 hash of canonical content for deduplication
// - $tags: Array of tag strings
// - $confidence: Confidence score (0.0 to 1.0)
// - $utility: Utility score (0.0 to 1.0)
// - $triage: Optional triage object (JSON)
// - $antiPattern: Optional antiPattern object (JSON)
MERGE (m:Memory { id: $id })
ON CREATE SET
  m.kind = $kind,
  m.polarity = $polarity,
  m.title = $title,
  m.content = $content,
  m.contentHash = $contentHash,
  m.tags = $tags,
  m.confidence = $confidence,
  m.utility = $utility,
  m.triage = $triage,
  m.antiPattern = $antiPattern,
  m.createdAt = datetime(),
  m.updatedAt = datetime()
ON MATCH SET
  m.kind = $kind,
  m.polarity = $polarity,
  m.title = $title,
  m.content = $content,
  m.tags = $tags,
  m.confidence = $confidence,
  m.utility = $utility,
  m.triage = $triage,
  m.antiPattern = $antiPattern,
  m.updatedAt = datetime()
RETURN m.id AS id;
