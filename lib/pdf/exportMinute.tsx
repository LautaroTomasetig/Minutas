import "server-only";
import path from "node:path";
import { Font, renderToBuffer } from "@react-pdf/renderer";
import { minuteSchema, type Minute } from "@/lib/schemas/minute";
import { MinuteDocument } from "./MinuteDocument";

Font.register({
  family: "Inter",
  fonts: [
    {
      src: path.join(
        process.cwd(),
        "node_modules/@fontsource/inter/files/inter-latin-400-normal.woff",
      ),
      fontWeight: 400,
    },
    {
      src: path.join(
        process.cwd(),
        "node_modules/@fontsource/inter/files/inter-latin-600-normal.woff",
      ),
      fontWeight: 600,
    },
  ],
});
Font.registerHyphenationCallback((word) => [word]);

export async function exportMinute(minute: Minute) {
  const validated = minuteSchema.parse(minute);
  return renderToBuffer(<MinuteDocument minute={validated} />);
}
