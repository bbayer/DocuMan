import { parseOffice } from "officeparser";

export async function parseDocx(buffer: Buffer): Promise<{
  text: string;
  metadata: { title?: string };
}> {
  const text = await parseOffice(buffer);

  return {
    text: typeof text === "string" ? text : String(text),
    metadata: {
      title: undefined,
    },
  };
}
