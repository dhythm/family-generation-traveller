import { openai } from "@ai-sdk/openai"
import { generateImage } from "ai"

export const maxDuration = 300

type Mode = "child" | "self" | "parent"
type FamilyRole = "child" | "self" | "parent"

type UploadedPhoto = {
  image: string
  role: FamilyRole
}

const MAX_PHOTOS = 6
const ROLE_LIMITS: Record<FamilyRole, number> = {
  child: 3,
  self: 1,
  parent: 2,
}

const ROLE_LABELS: Record<FamilyRole, string> = {
  child: "child",
  self: "current-generation adult",
  parent: "parent / senior generation",
}

const IMAGE_GENERATION_MODEL = "gpt-image-2"

const MODE_PROMPTS: Record<Mode, string> = {
  child:
    "Use the child-role reference images as the target-age references. Infer the target apparent age from those images. Keep child-role people at their current apparent age. Transform only the self-role and parent-role people to match the apparent age of the child-role references.",
  self:
    "Use the self-role reference image as the target-age reference. Infer the target apparent age from that image. Keep the self-role person at their current apparent age. Transform only the child-role and parent-role people to match the apparent age of the self-role reference.",
  parent:
    "Use the parent-role reference images as the target-age references. Infer the target apparent age from those images. Keep parent-role people at their current apparent age. Transform only the self-role and child-role people to match the apparent age of the parent-role references.",
}

function isFamilyRole(role: unknown): role is FamilyRole {
  return role === "child" || role === "self" || role === "parent"
}

function validatePhotos(photos: UploadedPhoto[]) {
  if (photos.length === 0) return "写真を1枚以上アップロードしてください。"
  if (photos.length > MAX_PHOTOS) return "アップロードできる写真は最大6枚です。"

  const counts: Record<FamilyRole, number> = { child: 0, self: 0, parent: 0 }
  for (const photo of photos) {
    if (!photo.image || !isFamilyRole(photo.role)) {
      return "すべての写真を子ども・自分・親のいずれかに分類してください。"
    }
    counts[photo.role] += 1
    if (counts[photo.role] > ROLE_LIMITS[photo.role]) {
      return "子どもは最大3名、自分は1名、親は最大2名までです。"
    }
  }

  return null
}

function validateTargetRole(photos: UploadedPhoto[], mode: Mode) {
  if (!photos.some((photo) => photo.role === mode)) {
    return "基準となる世代の写真を1枚以上分類してください。"
  }

  return null
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "OPENAI_API_KEY 環境変数を設定してください。" },
        { status: 500 },
      )
    }

    const { photos, mode } = (await req.json()) as {
      photos?: UploadedPhoto[]
      mode?: Mode
    }

    if (!photos || !mode || !MODE_PROMPTS[mode]) {
      return Response.json(
        { error: "写真と変換モードを指定してください。" },
        { status: 400 },
      )
    }

    const photoError = validatePhotos(photos)
    if (photoError) {
      return Response.json({ error: photoError }, { status: 400 })
    }

    const targetRoleError = validateTargetRole(photos, mode)
    if (targetRoleError) {
      return Response.json({ error: targetRoleError }, { status: 400 })
    }

    const transformationGuide = photos
      .map((photo, index) => {
        const action =
          photo.role === mode
            ? `use this ${ROLE_LABELS[photo.role]} person as a target-age reference and keep their apparent age unchanged`
            : `transform this ${ROLE_LABELS[photo.role]} person to match the apparent age inferred from the ${ROLE_LABELS[mode]} target-age reference images`
        return `Reference image ${index + 1}: ${action}.`
      })
      .join("\n")

    const result = await generateImage({
      model: openai.image(IMAGE_GENERATION_MODEL),
      prompt: {
        images: photos.map((photo) => photo.image),
        text: `Create one cohesive photorealistic family portrait using all uploaded references.

${MODE_PROMPTS[mode]}

Do not use a fixed numeric age range. Determine the target apparent age only from the target-role reference image or images supplied above.

Per-person instructions:
${transformationGuide}

Preserve each person's unique facial features, identity, hairstyle color, skin tone, glasses if any, and expression so each person remains recognizable. Do not omit anyone. Arrange them naturally as a warm family photo with consistent lighting, camera perspective, and background.`,
      },
      providerOptions: {
        openai: {
          quality: "high",
          outputFormat: "png",
        },
      },
    })

    return Response.json({ image: `data:${result.image.mediaType};base64,${result.image.base64}` })
  } catch (error) {
    console.error("[v0] Transform error:", error)
    return Response.json(
      { error: "変換中にエラーが発生しました。もう一度お試しください。" },
      { status: 500 },
    )
  }
}
