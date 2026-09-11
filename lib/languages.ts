// Whisper returns English language names. The API exposes ISO 639-1 codes.
const names =
  "afrikaans:af albanian:sq amharic:am arabic:ar armenian:hy assamese:as azerbaijani:az bashkir:ba basque:eu belarusian:be bengali:bn bosnian:bs breton:br bulgarian:bg burmese:my cantonese:yue catalan:ca chinese:zh croatian:hr czech:cs danish:da dutch:nl english:en estonian:et faroese:fo finnish:fi french:fr galician:gl georgian:ka german:de greek:el gujarati:gu haitian:ht hausa:ha hawaiian:haw hebrew:he hindi:hi hungarian:hu icelandic:is indonesian:id italian:it japanese:ja javanese:jv kannada:kn kazakh:kk khmer:km korean:ko lao:lo latin:la latvian:lv lingala:ln lithuanian:lt luxembourgish:lb macedonian:mk malagasy:mg malay:ms malayalam:ml maltese:mt maori:mi marathi:mr mongolian:mn nepali:ne norwegian:no nynorsk:nn occitan:oc pashto:ps persian:fa polish:pl portuguese:pt punjabi:pa romanian:ro russian:ru sanskrit:sa serbian:sr shona:sn sindhi:sd sinhala:si slovak:sk slovenian:sl somali:so spanish:es sundanese:su swahili:sw swedish:sv tagalog:tl tajik:tg tamil:ta tatar:tt telugu:te thai:th tibetan:bo turkish:tr turkmen:tk ukrainian:uk urdu:ur uzbek:uz vietnamese:vi welsh:cy yiddish:yi yoruba:yo";
const languageCodes: Record<string, string> = Object.fromEntries(
  names.split(" ").map((entry) => entry.split(":")),
);
export function normalizeLanguage(language: string) {
  const value = language.toLowerCase().trim();
  return languageCodes[value] ?? (/^[a-z]{2,3}$/.test(value) ? value : "und");
}
