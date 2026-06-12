"use client"

import { Baby, Download, Glasses, ImageIcon, Loader2, RotateCcw, Sparkles, Trash2, User } from "lucide-react"
import { useCallback, useRef, useState } from "react"

import { cn } from "@/lib/utils"

type Mode = "child" | "self" | "parent"
type FamilyRole = "child" | "self" | "parent"

type UploadedPhoto = {
  id: string
  image: string
  name: string
  role: FamilyRole | null
}

const MAX_PHOTOS = 6

const ROLE_OPTIONS: {
  id: FamilyRole
  label: string
  limit: number
  icon: typeof Baby
}[] = [
  { id: "child", label: "子ども", limit: 3, icon: Baby },
  { id: "self", label: "自分", limit: 1, icon: User },
  { id: "parent", label: "親", limit: 2, icon: Glasses },
]

const MODES: { id: Mode; label: string; description: string; icon: typeof Baby }[] = [
  {
    id: "child",
    label: "子どもの年齢にそろえる",
    description: "自分と親を子どもの写真の年齢に",
    icon: Baby,
  },
  {
    id: "self",
    label: "自分の年齢にそろえる",
    description: "子どもと親を自分の写真の年齢に",
    icon: User,
  },
  {
    id: "parent",
    label: "親の年齢にそろえる",
    description: "自分と子どもを親の写真の年齢に",
    icon: Glasses,
  },
]

const ROLE_LABELS: Record<FamilyRole, string> = {
  child: "子ども",
  self: "自分",
  parent: "親",
}

const MODE_LABELS: Record<Mode, string> = {
  child: "子どもの年齢にそろえる",
  self: "自分の年齢にそろえる",
  parent: "親の年齢にそろえる",
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
  const [photos, setPhotos] = useState<UploadedPhoto[]>([])
  const [mode, setMode] = useState<Mode | null>(null)
  const [resultImage, setResultImage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const roleCounts = ROLE_OPTIONS.reduce(
    (counts, role) => ({
      ...counts,
      [role.id]: photos.filter((photo) => photo.role === role.id).length,
    }),
    {} as Record<FamilyRole, number>,
  )
  const classifiedPhotos = photos.filter(
    (photo): photo is UploadedPhoto & { role: FamilyRole } => photo.role !== null,
  )
  const hasUnclassifiedPhoto = photos.some((photo) => photo.role === null)
  const hasTargetRolePhoto = mode !== null && roleCounts[mode] > 0
  const canTransform = classifiedPhotos.length > 0 && !hasUnclassifiedPhoto && mode !== null && hasTargetRolePhoto

  const handleFiles = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList)
    const imageFiles = files.filter((file) => file.type.startsWith("image/"))
    if (imageFiles.length !== files.length) {
      setError("JPG / PNG / WebP などの画像ファイルを選択してください。")
      return
    }
    if (imageFiles.length === 0) return

    setError(null)
    setResultImage(null)

    const remainingSlots = MAX_PHOTOS - photos.length
    if (remainingSlots <= 0) {
      setError("アップロードできる写真は最大6枚です。")
      return
    }

    const filesToAdd = imageFiles.slice(0, remainingSlots)
    if (imageFiles.length > remainingSlots) {
      setError(`アップロードできる写真は最大6枚です。${remainingSlots}枚だけ追加しました。`)
    }

    try {
      const resizedPhotos = await Promise.all(
        filesToAdd.map(async (file) => ({
          id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
          image: await resizeImage(file),
          name: file.name,
          role: null,
        })),
      )
      setPhotos((currentPhotos) => [...currentPhotos, ...resizedPhotos])
    } catch {
      setError("画像の読み込みに失敗しました。別のファイルをお試しください。")
    }
  }, [photos.length])

  const assignRole = (photoId: string, role: FamilyRole) => {
    const currentPhoto = photos.find((photo) => photo.id === photoId)
    if (!currentPhoto) return

    const currentCount = roleCounts[role]
    const selectingSameRole = currentPhoto.role === role
    const roleLimit = ROLE_OPTIONS.find((option) => option.id === role)?.limit ?? 0
    if (!selectingSameRole && currentCount >= roleLimit) {
      setError(`${ROLE_LABELS[role]}は最大${roleLimit}名までです。`)
      return
    }

    setError(null)
    setResultImage(null)
    setPhotos((currentPhotos) =>
      currentPhotos.map((photo) => (photo.id === photoId ? { ...photo, role } : photo)),
    )
  }

  const removePhoto = (photoId: string) => {
    setError(null)
    setResultImage(null)
    setPhotos((currentPhotos) => currentPhotos.filter((photo) => photo.id !== photoId))
  }

  const handleTransform = async () => {
    if (!canTransform || !mode) return
    setLoading(true)
    setError(null)
    setResultImage(null)
    try {
      const res = await fetch("/api/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: classifiedPhotos, mode }),
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
    setPhotos([])
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
          親は最大2名、自分は1名、子どもは最大3名まで。合計6枚までアップロードできます。
        </p>

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
            void handleFiles(e.dataTransfer.files)
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-foreground border-dashed bg-card px-6 py-12 text-center transition-colors",
            dragging ? "bg-accent" : "hover:bg-secondary",
            photos.length >= MAX_PHOTOS && "cursor-not-allowed opacity-60",
          )}
        >
          <ImageIcon className="size-10 text-primary" aria-hidden="true" />
          <div>
            <p className="font-bold">クリックして写真を選択</p>
            <p className="mt-1 text-muted-foreground text-sm">
              またはドラッグ＆ドロップ（JPG / PNG / WebP、最大{MAX_PHOTOS}枚）
            </p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => {
            const files = e.target.files
            if (files) void handleFiles(files)
            e.currentTarget.value = ""
          }}
        />

        {photos.length > 0 && (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              {ROLE_OPTIONS.map((role) => (
                <span key={role.id} className="rounded-full border border-foreground/25 px-3 py-1 font-medium">
                  {role.label} {roleCounts[role.id]} / {role.limit}
                </span>
              ))}
              <span className="rounded-full border border-foreground/25 px-3 py-1 font-medium">
                合計 {photos.length} / {MAX_PHOTOS}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((photo, index) => (
                <div key={photo.id} className="rounded-lg border-2 border-foreground bg-card p-3">
                  <div className="relative overflow-hidden rounded-md border border-foreground/20 bg-secondary">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.image} alt={`${index + 1}枚目のアップロード写真`} className="aspect-square w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(photo.id)}
                      className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background"
                      aria-label={`${index + 1}枚目の写真を削除`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="mt-2 truncate text-xs text-muted-foreground">{photo.name}</p>
                  <div className="mt-3 grid grid-cols-3 gap-1" role="radiogroup" aria-label={`${index + 1}枚目の分類`}>
                    {ROLE_OPTIONS.map((role) => {
                      const Icon = role.icon
                      const selected = photo.role === role.id
                      const disabled = !selected && roleCounts[role.id] >= role.limit
                      return (
                        <button
                          key={role.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={disabled || loading}
                          onClick={() => assignRole(photo.id, role.id)}
                          className={cn(
                            "flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border px-2 py-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-35",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-foreground/30 bg-background hover:bg-secondary",
                          )}
                        >
                          <Icon className="size-4" aria-hidden="true" />
                          {role.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Step 2: Mode */}
      <section aria-labelledby="step2-heading">
        <h2 id="step2-heading" className="mb-1 font-bold text-lg uppercase tracking-wide">
          ステップ 2：変換モードを選択
        </h2>
        <p className="mb-4 text-muted-foreground text-sm leading-relaxed">
          どの世代の年齢にそろえますか？選んだ世代はそのまま、他の世代だけ変換します。
        </p>

        <div className="grid gap-4 sm:grid-cols-3" role="radiogroup" aria-label="変換モード">
          {MODES.map((m) => {
            const Icon = m.icon
            const selected = mode === m.id
            const disabled = photos.length === 0 || hasUnclassifiedPhoto || roleCounts[m.id] === 0 || loading
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
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
          GPT Image 2 が顔の特徴を保ったまま、選択した世代の年齢にそろえます。
        </p>

        <button
          type="button"
          onClick={handleTransform}
          disabled={!canTransform || loading}
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
