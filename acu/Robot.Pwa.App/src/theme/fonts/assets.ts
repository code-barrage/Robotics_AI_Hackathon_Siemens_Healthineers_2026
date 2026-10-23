import { SourceSans3_400Regular } from "@expo-google-fonts/source-sans-3/400Regular";
import { SourceSans3_700Bold } from "@expo-google-fonts/source-sans-3/700Bold";
import { SourceSans3_900Black } from "@expo-google-fonts/source-sans-3/900Black";
import { FontFamily } from "./typography";

export const fonts = {
  [FontFamily.roman]: SourceSans3_400Regular,
  [FontFamily.bold]: SourceSans3_700Bold,
  [FontFamily.black]: SourceSans3_900Black,
};
