import pdfParse from "pdf-parse";

export async function parsePdf(buffer: Buffer): Promise<{
  text: string;
  metadata: { title?: string; author?: string; pages: number };
}> {
  const data = await pdfParse(buffer);

  return {
    text: data.text,
    metadata: {
      title: data.info?.Title || undefined,
      author: data.info?.Author || undefined,
      pages: data.numpages,
    },
  };
}
