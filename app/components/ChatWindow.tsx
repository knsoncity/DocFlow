"use client";

import Image from "next/image";
import { useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { v4 as uuidv4 } from "uuid";
import {
  AnalysisSourceType,
  ChatImageAttachment,
  DocumentSummary,
  Message,
  Schedule,
  SpreadsheetSheet,
} from "../types";

function cleanContent(text: string) {
  return text.replace(/```json\s*[\s\S]*?```/g, "").trim();
}

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  content: `안녕하세요! **DocFlow** AI 코파일럿입니다.

문서를 분석하는 것뿐 아니라, 대화형으로 같이 정리하고 판단할 수 있습니다.

- 문서, URL, 파일, 이미지 분석 및 카드 등록
- 등록된 문서 요약, 상태 설명, 다음 액션 제안
- 새 카드 생성, 제목 변경, 일정/상태 변경, 삭제 요청 처리
- 기획 방향 상담, 우선순위 정리, TODO 초안 작성
- 여러 장 이미지 OCR + 설명 텍스트 함께 처리`,
};

type ChatRequestMessage = Pick<Message, "role" | "content">;

type ImagePayload = {
  data: string;
  mimeType: string;
  name: string;
};

type SpreadsheetPayload = {
  sheets: SpreadsheetSheet[];
};

const TEXT_FILE_EXTENSIONS = ["pdf", "docx", "txt", "md", "csv", "xlsx", "xls"];
const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_SIZE_MB = 10;
const DEFAULT_IMAGE_ANALYSIS_PROMPT =
  "첨부한 이미지들 안의 기획 문서나 화면 설계 내용을 읽고, DocFlow 형식에 맞춰 분석해줘. 이미지 안의 텍스트를 최대한 정확히 추출해서 판단해줘.";

export default function ChatWindow({
  onDocAdded,
  onDocUpdated,
  onDocDeleted,
  onScheduleAdded,
  authorName,
  accessToken,
  workspaceId,
}: {
  onDocAdded: (doc: DocumentSummary) => void;
  onDocUpdated?: (doc: DocumentSummary) => void;
  onDocDeleted?: (docId: string) => void;
  onScheduleAdded?: (schedule: Schedule) => void;
  authorName?: string;
  accessToken?: string;
  workspaceId?: string;
}) {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [pendingImages, setPendingImages] = useState<ChatImageAttachment[]>([]);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;

    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTo({
        top: viewport.scrollHeight,
        behavior: "auto",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messages, pendingImages]);

  const isLoading = loading || fileLoading;

  const analyzeMessage = async ({
    userMessage,
    analysisContent,
    images,
    userPrompt,
    sourceType,
    sourceLabel,
    authorName,
    spreadsheet,
  }: {
    userMessage: Message;
    analysisContent: string;
    images?: ImagePayload[];
    userPrompt?: string;
    sourceType?: AnalysisSourceType;
    sourceLabel?: string;
    authorName?: string;
    spreadsheet?: SpreadsheetPayload;
  }) => {
    if ((!analysisContent.trim() && !images?.length) || isLoading) return;

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    const history: ChatRequestMessage[] = [
      ...messages.filter((message) => message.id !== "welcome"),
      userMessage,
    ].map((message) => ({
      role: message.role,
      content: message.content,
    }));

    const assistantId = uuidv4();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(workspaceId ? { "x-docflow-workspace-id": workspaceId } : {}),
        },
        body: JSON.stringify({
          messages: history,
          images,
          analysisContent,
          userPrompt,
          sourceType,
          sourceLabel,
          authorName,
          spreadsheet,
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error("AI 분석 요청에 실패했습니다.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let eventBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        eventBuffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        const events = eventBuffer.split("\n\n");
        eventBuffer = events.pop() ?? "";

        for (const event of events) {
          const dataLine = event
            .split("\n")
            .find((line) => line.startsWith("data: "));

          if (!dataLine) continue;

          const data = dataLine.slice(6);
          if (data === "[DONE]") continue;

          const payload = JSON.parse(data) as {
            text?: string;
            savedDoc?: DocumentSummary;
            updatedDoc?: DocumentSummary;
            deletedDocId?: string;
            savedSchedule?: Schedule;
          };

          if (payload.text) {
            fullText += payload.text;
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId ? { ...message, content: fullText } : message
              )
            );
          }

          if (payload.savedDoc) {
            const savedDoc = payload.savedDoc;
            onDocAdded(savedDoc);
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantId
                  ? { ...message, docMeta: savedDoc.meta }
                  : message
              )
            );
          }

          if (payload.updatedDoc) {
            onDocUpdated?.(payload.updatedDoc);
          }

          if (payload.deletedDocId) {
            onDocDeleted?.(payload.deletedDocId);
          }

          if (payload.savedSchedule) {
            onScheduleAdded?.(payload.savedSchedule);
          }
        }

        if (done) break;
      }
    } catch (error) {
      console.error(error);
      const errorText =
        error instanceof Error ? `❌ ${error.message}` : "❌ 요청 처리 중 오류가 발생했습니다.";
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId ? { ...message, content: errorText } : message
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("이미지 파일을 읽지 못했습니다."));
      reader.readAsDataURL(file);
    });

  const createImageAttachment = async (file: File): Promise<ChatImageAttachment> => {
    const dataUrl = await readFileAsDataUrl(file);
    const base64 = dataUrl.split(",")[1];
    if (!base64) {
      throw new Error("이미지 인코딩에 실패했습니다.");
    }

    return {
      id: uuidv4(),
      name: file.name,
      mimeType: file.type,
      data: base64,
      previewUrl: dataUrl,
      size: file.size,
    };
  };

  const queueImageFiles = async (files: File[]) => {
    const accepted = files.filter((file) => IMAGE_MIME_TYPES.includes(file.type));
    const oversized = accepted.filter((file) => file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024);
    const valid = accepted.filter((file) => file.size <= MAX_IMAGE_SIZE_MB * 1024 * 1024);
    const rejected = files.filter((file) => !IMAGE_MIME_TYPES.includes(file.type));

    if (rejected.length > 0) {
      alert("이미지는 PNG, JPG, WEBP, GIF 파일만 첨부할 수 있습니다.");
    }

    if (oversized.length > 0) {
      alert(`이미지 파일은 ${MAX_IMAGE_SIZE_MB}MB 이하만 첨부할 수 있습니다.`);
    }

    if (valid.length === 0) return;

    const attachments = await Promise.all(valid.map(createImageAttachment));
    setPendingImages((prev) => [...prev, ...attachments]);
  };

  const removePendingImage = (id: string) => {
    setPendingImages((prev) => prev.filter((image) => image.id !== id));
  };

  const handleDocumentFile = async (file: File) => {
    setFileLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/parse-file", { method: "POST", body: formData });
      const data = (await res.json()) as {
        error?: string;
        text?: string;
        spreadsheetSheets?: SpreadsheetSheet[];
      };

      if (data.error || !data.text) {
        setMessages((prev) => [
          ...prev,
          { id: uuidv4(), role: "assistant", content: `❌ ${data.error ?? "파일 파싱 실패"}` },
        ]);
        return;
      }

      await analyzeMessage({
        userMessage: {
          id: uuidv4(),
          role: "user",
          content: `📎 ${file.name} (${(file.size / 1024).toFixed(1)}KB)`,
        },
        analysisContent: `[파일명: ${file.name}]\n\n${data.text}`,
        sourceType: "file",
        sourceLabel: file.name,
        authorName,
        spreadsheet:
          data.spreadsheetSheets && data.spreadsheetSheets.length > 0
            ? { sheets: data.spreadsheetSheets }
            : undefined,
      });
    } catch (error) {
      console.error(error);
      setMessages((prev) => [
        ...prev,
        { id: uuidv4(), role: "assistant", content: "❌ 파일 처리 중 오류가 발생했습니다." },
      ]);
    } finally {
      setFileLoading(false);
    }
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const imageFiles = files.filter((file) => IMAGE_MIME_TYPES.includes(file.type));
    const documentFiles = files.filter((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      return TEXT_FILE_EXTENSIONS.includes(ext);
    });
    const unsupportedFiles = files.filter((file) => {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      return !IMAGE_MIME_TYPES.includes(file.type) && !TEXT_FILE_EXTENSIONS.includes(ext);
    });

    if (unsupportedFiles.length > 0) {
      alert("PDF, DOCX, TXT, MD, CSV, XLSX, XLS, PNG, JPG, WEBP, GIF 파일만 지원합니다.");
    }

    if (imageFiles.length > 0) {
      await queueImageFiles(imageFiles);
    }

    for (const file of documentFiles) {
      await handleDocumentFile(file);
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) {
      await handleFiles(files);
    }
    e.target.value = "";
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedFiles = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (pastedFiles.length === 0) return;

    e.preventDefault();
    await queueImageFiles(pastedFiles);
  };

  const sendText = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    await analyzeMessage({
      userMessage: { id: uuidv4(), role: "user", content: trimmed },
      analysisContent: trimmed,
      authorName,
    });
  };

  const handleSend = async () => {
    const text = input.trim();
    if (isLoading || isComposing) return;

    if (pendingImages.length > 0) {
      const queuedImages = [...pendingImages];
      setPendingImages([]);
      setInput("");

      const displayText =
        text || `🖼️ 이미지 ${queuedImages.length}장 첨부`;

      await analyzeMessage({
        userMessage: {
          id: uuidv4(),
          role: "user",
          content: displayText,
          attachments: queuedImages,
        },
        analysisContent: text || DEFAULT_IMAGE_ANALYSIS_PROMPT,
        userPrompt: text || undefined,
        sourceType: "image",
        sourceLabel: queuedImages.map((image) => image.name).join(", "),
        authorName,
        images: queuedImages.map((image) => ({
          data: image.data,
          mimeType: image.mimeType,
          name: image.name,
          previewUrl: image.previewUrl,
        })),
      });
      return;
    }

    if (!text) return;

    setInput("");

    const urlPattern = /^https?:\/\/[^\s]+$/;
    if (urlPattern.test(text)) {
      setFileLoading(true);
      try {
        const res = await fetch("/api/parse-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: text }),
        });
        const data = (await res.json()) as { error?: string; text?: string };

        if (data.error || !data.text) {
          setMessages((prev) => [
            ...prev,
            { id: uuidv4(), role: "assistant", content: `❌ ${data.error ?? "URL 파싱 실패"}` },
          ]);
        } else {
          await analyzeMessage({
            userMessage: { id: uuidv4(), role: "user", content: `🔗 ${text}` },
            analysisContent: `[URL: ${text}]\n\n${data.text}`,
            sourceType: "url",
            sourceLabel: text,
            authorName,
          });
        }
      } finally {
        setFileLoading(false);
      }
      return;
    }

    await sendText(text);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    const nativeEvent = e.nativeEvent as KeyboardEvent;

    if (isComposing || nativeEvent.isComposing || nativeEvent.keyCode === 229) {
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => void handleDrop(e)}
    >
      {dragOver && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-blue-500 bg-blue-500/10">
          <p className="text-[13px] font-semibold tracking-[-0.02em] text-blue-400">파일을 여기에 놓으세요</p>
          <p className="mt-1 text-[11px] tracking-[0.01em] text-blue-500/70">PDF · DOCX · TXT · MD · CSV · XLSX · 이미지</p>
        </div>
      )}

      <div
        ref={messagesViewportRef}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-5 lg:px-5"
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div aria-hidden="true" className="mr-2 mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-[11px] bg-blue-600 text-[10px] font-semibold text-white">
                D
              </div>
            )}
            <div
              className={`max-w-[82%] rounded-[18px] px-4 py-3 text-[12.5px] leading-[1.72] tracking-[-0.01em] shadow-[0_10px_26px_rgba(15,15,14,0.04)] ${
                msg.role === "user"
                  ? "rounded-br-[6px] bg-blue-600 text-white"
                  : "rounded-bl-[6px] border border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text)]"
              }`}
            >
              {msg.role === "user" ? (
                <div className="space-y-2">
                  <span className="block whitespace-pre-wrap">{msg.content}</span>
                  {msg.attachments?.length ? (
                    <div className="grid grid-cols-2 gap-2">
                      {msg.attachments.map((attachment) => (
                        <div key={attachment.id} className="overflow-hidden rounded-[12px] border border-white/20 bg-white/10">
                          <Image src={attachment.previewUrl} alt={attachment.name} width={400} height={280} unoptimized className="h-28 w-full object-cover" />
                          <div className="truncate px-2 py-1 text-[10.5px] text-white/80">{attachment.name}</div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="docflow-markdown prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1">
                  <ReactMarkdown>{cleanContent(msg.content)}</ReactMarkdown>
                </div>
              )}
              {msg.docMeta?.isDocument && (
                <div className="mt-2 pt-2 border-t border-[var(--border)] flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                  <span className="text-[11px] text-[var(--text-muted)]">문서 등록됨</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div role="status" aria-live="polite" className="flex justify-start">
            <div aria-hidden="true" className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-[11px] bg-blue-600 text-[10px] font-semibold text-white">
              D
            </div>
            <div className="rounded-[18px] rounded-bl-[6px] border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3">
              <div className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
              <span className="sr-only">응답 생성 중…</span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--bg)] p-3 lg:p-4">
        <div className="mb-2 flex items-center justify-between px-0.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--text-muted)]">작성자</span>
          <span className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-subtle)] px-2 py-0.5 text-[10.5px] text-[var(--text-subtle)]">
            {authorName?.trim() || "미설정"}
          </span>
        </div>

        {pendingImages.length > 0 && (
          <div className="mb-3 rounded-[14px] border border-blue-500/20 bg-blue-500/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11.5px] font-medium tracking-[-0.01em] text-blue-400">이미지 {pendingImages.length}장 첨부됨</p>
              <button type="button" aria-label="이미지 모두 제거" onClick={() => setPendingImages([])}
                className="rounded-[10px] text-[10.5px] text-blue-400 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >모두 제거</button>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {pendingImages.map((image) => (
                <div key={image.id} className="relative shrink-0">
                  <Image src={image.previewUrl} alt={image.name} width={112} height={84} unoptimized
                    className="h-20 w-28 rounded-[12px] border border-[var(--border)] object-cover" />
                  <button type="button" aria-label={`${image.name} 제거`} onClick={() => removePendingImage(image.id)}
                    className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <span aria-hidden="true">✕</span>
                  </button>
                  <p className="mt-1 max-w-28 truncate text-[10px] tracking-[0.01em] text-[var(--text-muted)]">{image.name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-end gap-2 rounded-[14px] border border-[var(--border)] bg-[var(--bg-subtle)] px-3 py-2.5">
          <button
            type="button"
            aria-label="파일 첨부"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface)] hover:text-blue-400 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          <input ref={fileInputRef} type="file" multiple
            accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.xls,image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => void handleFileInput(e)} className="hidden" aria-hidden="true" />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            onPaste={(e) => void handlePaste(e)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={(e) => { setIsComposing(false); setInput(e.currentTarget.value); }}
            placeholder={pendingImages.length > 0 ? "이미지에 대한 설명이나 질문을 입력하세요…" : "문서 분석, 질문, 기획 상담, URL 입력…"}
            rows={2}
            className="max-h-40 flex-1 resize-none bg-transparent text-[12.5px] leading-[1.7] tracking-[-0.01em] text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none"
          />

          <button
            type="button"
            aria-label="전송"
            onClick={() => void handleSend()}
            disabled={(!input.trim() && pendingImages.length === 0) || isLoading}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <p className="mt-1.5 text-center text-[10.5px] tracking-[0.01em] text-[var(--text-muted)]">
          Enter 전송 · Shift+Enter 줄바꿈 · 이미지 드래그 또는 붙여넣기 가능
        </p>
      </div>
    </div>
  );
}
