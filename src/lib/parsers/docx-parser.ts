import { parseOfficeAsync } from "officeparser";

export async function parseDocx(buffer: Buffer): Promise<{
  text: string;
  metadata: { title?: string };
}> {
  const text = await parseOfficeAsync(buffer);

  return {
    text: typeof text === "string" ? text : String(text),
    metadata: {
      title: undefined,
    },
  };
}
