"use client"

import { Baby, Download, Glasses, ImageIcon, Loader2, RotateCcw, Sparkles, User } from "lucide-react"
import { useCallback, useRef, useState } from "react"

import { cn } from "@/lib/utils"

type Mode = "child" | "self" | "parent"

const MODES: { id: Mode; label: string; description: string; icon: typeof Baby }[] = [
  {
    id: "child",
    label: "全員を子供に",
    description: "家族みんなが5〜7歳の子供時代に",
    icon: Baby,
  },
  {
    id: "self",
    label: "全員を自分の年齢に",
    description: "家族みんなが30代の大人に",
    icon: User,
  },
  {
    id: "parent",
    label: "全員を親の年齢に",
    description: "家族みんなが65〜70歳のシニアに",
    icon: Glasses,
  },
]

const MODE_LABELS: Record<Mode, string> = {
  child: "全員を子供に変換",
  self: "全員を自分の年齢に変換",
  parent: "全員を親の年齢に変換",
}

async function resizeImage(file: File, maxSize = 1536): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"))
    reader.readAsDataURL(file)
  })

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = "anonymous"
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("画像の読み込みに失敗しました"))
    image.src = dataUrl
  })

  const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
  if (scale === 1) return dataUrl

  const canvas = document.createElement("canvas")
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", 0.92)
}

export function AgeTransformer() {
  const [sourceImage, setSourceImage] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode | null>(null)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選択してください。")
      return
    }
    setError(null)
    setResultImage(null)
    try {
      const resized = await resizeImage(file)
      setSourceImage(resized)
    } catch {
      setError("画像の読み込みに失敗しました。別のファイルをお試しください。")
    }
  }, [])

  const handleTransform = async () => {
    if (!sourceImage || !mode) return
    setLoading(true)
    setError(null)
    setResultImage(null)
    try {
      const res = await fetch("/api/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: sourceImage, mode }),
      })
      const data = (await res.json()) as { image?: string; error?: string }
      if (!res.ok || !data.image) {
        throw new Error(data.error || "変換に失敗しました。")
      }
      setResultImage(data.image)
    } catch (e) {
      setError(e instanceof Error ? e.message : "変換に失敗しました。もう一度お試しください。")
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setSourceImage(null)
    setMode(null)
    setResultImage(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Step 1: Upload */}
      <section aria-labelledby="step1-heading">
        <h2 id="step1-heading" className="mb-1 font-bold text-lg uppercase tracking-wide">
          ステップ 1：写真をアップロード
        </h2>
        <p className="mb-4 text-muted-foreground text-sm leading-relaxed">
          親・自分・子供の3世代が写った写真をアップロードしてください。
        </p>

        {sourceImage ? (
          <div className="flex flex-col items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sourceImage || "/placeholder.svg"}
              alt="アップロードされた3世代の家族写真"
              className="max-h-96 w-auto rounded-lg border-2 border-foreground"
            />
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-md border-2 border-foreground bg-background px-4 py-2 font-medium text-sm transition-colors hover:bg-secondary"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              写真を変更する
            </button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-label="クリックまたはドラッグ＆ドロップで写真をアップロード"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files?.[0]
              if (file) handleFile(file)
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-foreground border-dashed bg-card px-6 py-14 text-center transition-colors",
              dragging ? "bg-accent" : "hover:bg-secondary",
            )}
          >
            <ImageIcon className="size-10 text-primary" aria-hidden="true" />
            <div>
              <p className="font-bold">クリックして写真を選択</p>
              <p className="mt-1 text-muted-foreground text-sm">またはドラッグ＆ドロップ（JPG / PNG / WebP）</p>
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
      </section>

      {/* Step 2: Mode */}
      <section aria-labelledby="step2-heading">
        <h2 id="step2-heading" className="mb-1 font-bold text-lg uppercase tracking-wide">
          ステップ 2：変換モードを選択
        </h2>
        <p className="mb-4 text-muted-foreground text-sm leading-relaxed">写真の全員をどの年齢にしますか？</p>

        <div className="grid gap-4 sm:grid-cols-3" role="radiogroup" aria-label="変換モード">
          {MODES.map((m) => {
            const Icon = m.icon
            const selected = mode === m.id
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!sourceImage || loading}
                onClick={() => setMode(m.id)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border-2 px-4 py-6 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  selected
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-foreground bg-card hover:bg-secondary",
                )}
              >
                <Icon className="size-8" aria-hidden="true" />
                <span className="font-bold text-balance">{m.label}</span>
                <span
                  className={cn("text-xs leading-relaxed", selected ? "text-primary-foreground" : "text-muted-foreground")}
                >
                  {m.description}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Step 3: Transform & Result */}
      <section aria-labelledby="step3-heading">
        <h2 id="step3-heading" className="mb-1 font-bold text-lg uppercase tracking-wide">
          ステップ 3：変換する
        </h2>
        <p className="mb-4 text-muted-foreground text-sm leading-relaxed">
          GPT Image 2 が顔の特徴を保ったまま、全員の年齢を変換します。
        </p>

        <button
          type="button"
          onClick={handleTransform}
          disabled={!sourceImage || !mode || loading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-8 py-3 font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (
            <>
              <Loader2 className="size-5 animate-spin" aria-hidden="true" />
              変換中…（1〜2分かかります）
            </>
          ) : (
            <>
              <Sparkles className="size-5" aria-hidden="true" />
              {mode ? MODE_LABELS[mode] : "変換する"}
            </>
          )}
        </button>

        {error && (
          <p role="alert" className="mt-4 rounded-md border-2 border-destructive bg-card px-4 py-3 text-destructive text-sm">
            {error}
          </p>
        )}

        {resultImage && (
          <div className="mt-6 flex flex-col items-start gap-3">
            <div className="rounded-lg border-2 border-foreground bg-card p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resultImage || "/placeholder.svg"}
                alt="年齢変換された家族写真"
                className="max-h-[32rem] w-auto rounded-md"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={resultImage}
                download="family-age-transformed.png"
                className="inline-flex items-center gap-2 rounded-md bg-foreground px-5 py-2.5 font-medium text-background text-sm transition-opacity hover:opacity-90"
              >
                <Download className="size-4" aria-hidden="true" />
                画像をダウンロード
              </a>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-2 rounded-md border-2 border-foreground bg-background px-5 py-2.5 font-medium text-sm transition-colors hover:bg-secondary"
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                別の写真を試す
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
