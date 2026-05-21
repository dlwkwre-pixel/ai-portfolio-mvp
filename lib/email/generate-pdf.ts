import React from "react";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { renderToBuffer } = require("@react-pdf/renderer");
import { PortfolioPDF } from "./digest-pdf";
import type { DigestTemplateData } from "./digest-template";

export async function generateDigestPDF(data: DigestTemplateData): Promise<Buffer> {
  const element = React.createElement(PortfolioPDF, { data });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await renderToBuffer(element as any) as Buffer;
}
