export async function parseTxt(buffer: Buffer): Promise<{
  text: string;
  metadata: { title?: string };
}> {
  const text = buffer.toString("utf-8");

  // Try to detect title from first non-empty line
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const title = lines.length > 0 ? lines[0].trim().substring(0, 200) : undefined;

  return {
    text,
    metadata: { title },
  };
}
