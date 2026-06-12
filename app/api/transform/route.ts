import { openai } from "@ai-sdk/openai"
import { generateImage } from "ai"

export const maxDuration = 300

type Mode = "child" | "self" | "parent"
type FamilyRole = "child" | "self" | "parent"

type UploadedPhoto = {
  image: string
  role: FamilyRole
}

type TransformedPhoto = {
  image: string
  role: FamilyRole
  originalIndex: number
  transformed: boolean
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
    "Use the child-role reference image or images only as target-age references. Infer the target apparent age from those reference images. Transform the person in the source photo to match that apparent age. The transformed person must look like a natural child, with age-appropriate natural hair, skin texture, and clothing. Do not keep age-related gray, white, or silver hair from the source photo.",
  self:
    "Use the self-role reference image only as the target-age reference. Infer the target apparent age from that reference image. Transform the person in the source photo to match that apparent age, with hair, skin texture, and clothing that are natural for the self-role reference age.",
  parent:
    "Use the parent-role reference image or images only as target-age references. Infer the target apparent age from those reference images. Transform the person in the source photo to match that apparent age, with hair, skin texture, and clothing that are natural for the parent-role reference age. Natural gray, white, or silver hair and other age-appropriate senior features are allowed when they match the parent-role references.",
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

    const targetPhotos = photos.filter((photo) => photo.role === mode)
    const transformedPhotos = await Promise.all(
      photos.map(async (photo, index): Promise<TransformedPhoto> => {
        if (photo.role === mode) {
          return {
            image: photo.image,
            role: photo.role,
            originalIndex: index,
            transformed: false,
          }
        }

        const result = await generateImage({
          model: openai.image(IMAGE_GENERATION_MODEL),
          prompt: {
            images: [photo.image, ...targetPhotos.map((targetPhoto) => targetPhoto.image)],
            text: `Edit only the person in source image 1. Do not create a group photo. Do not combine people from multiple references into one scene.

${MODE_PROMPTS[mode]}

Source image 1 role: ${ROLE_LABELS[photo.role]}.
Reference images 2 and later role: ${ROLE_LABELS[mode]} target-age references.

Do not use a fixed numeric age range. Determine the target apparent age only from the target-role reference image or images.

Preserve the source photo's composition, pose, crop, background, lighting, expression, skin tone, and glasses if any. Preserve the person's identity primarily through the shape and distinctive details of the eyes, nose, mouth, smile, jawline, and the area around the mouth. Recreate hair, skin sheen/texture, and clothing so they look natural for the inferred target age, rather than preserving age-inconsistent hair, skin, or clothing artifacts from the source photo. Output one edited image corresponding to source image 1 only.`,
          },
          providerOptions: {
            openai: {
              quality: "high",
              outputFormat: "png",
            },
          },
        })

        return {
          image: `data:${result.image.mediaType};base64,${result.image.base64}`,
          role: photo.role,
          originalIndex: index,
          transformed: true,
        }
      }),
    )

    return Response.json({ images: transformedPhotos })
  } catch (error) {
    console.error("[v0] Transform error:", error)
    return Response.json(
      { error: "変換中にエラーが発生しました。もう一度お試しください。" },
      { status: 500 },
    )
  }
}
