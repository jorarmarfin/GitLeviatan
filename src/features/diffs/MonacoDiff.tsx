// Monaco se carga siempre desde el propio bundle (workers incluidos): nada de CDN.
import { DiffEditor, loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import CssWorker from "monaco-editor/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/language/json/json.worker?worker";
import TsWorker from "monaco-editor/language/typescript/ts.worker?worker";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    switch (label) {
      case "json":
        return new JsonWorker();
      case "css":
      case "scss":
      case "less":
        return new CssWorker();
      case "html":
      case "handlebars":
      case "razor":
        return new HtmlWorker();
      case "typescript":
      case "javascript":
        return new TsWorker();
      default:
        return new EditorWorker();
    }
  },
};

loader.config({ monaco });

type Props = { path: string; original: string; modified: string; dark: boolean };

export default function MonacoDiff({ path, original, modified, dark }: Props) {
  // La extensión del modelo decide el lenguaje; el original y el modificado necesitan URIs distintas.
  const model = encodeURIComponent(path);
  return (
    <DiffEditor
      height="100%"
      theme={dark ? "vs-dark" : "vs"}
      original={original}
      modified={modified}
      originalModelPath={`inmemory://diff/original/${model}`}
      modifiedModelPath={`inmemory://diff/modified/${model}`}
      options={{
        readOnly: true,
        originalEditable: false,
        renderSideBySide: true,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
      }}
    />
  );
}
