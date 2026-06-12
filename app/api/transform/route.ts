import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"

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

const MODE_PROMPTS: Record<Mode, string> = {
  child: `Create one cohesive photorealistic family portrait where EVERY referenced person appears as a young child, approximately 5 to 7 years old. Transform each person's face and body to look like a natural child version of themselves, preserving their unique facial features, identity, hairstyle color, skin tone, glasses if any, and expressions so each person is still recognizable. Keep each person's generational relationship clear while making everyone the same child age.`,
  self: `Create one cohesive photorealistic family portrait where EVERY referenced person appears as an adult in their mid-30s. Transform each person's face and body to look like a natural mid-30s adult version of themselves, preserving their unique facial features, identity, hairstyle color, skin tone, glasses if any, and expressions so each person is still recognizable. Keep each person's generational relationship clear while making everyone the same adult age.`,
  parent: `Create one cohesive photorealistic family portrait where EVERY referenced person appears as a senior, approximately 65 to 70 years old. Transform each person's face and body to look like a natural senior version of themselves with age-appropriate features, preserving their unique facial features, identity, skin tone, glasses if any, and expressions so each person is still recognizable. Keep each person's generational relationship clear while making everyone the same senior age.`,
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

export async function POST(req: Request) {
  try {
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

    const roleGuide = photos
      .map((photo, index) => `Reference image ${index + 1}: ${ROLE_LABELS[photo.role]}`)
      .join("\n")

    const result = await generateText({
      model: "openai/gpt-5.1-instant",
      messages: [
        {
          role: "user",
          content: [
            ...photos.flatMap((photo, index) => [
              { type: "text" as const, text: `Reference image ${index + 1}: ${ROLE_LABELS[photo.role]}` },
              { type: "image" as const, image: photo.image },
            ]),
            {
              type: "text",
              text: `${roleGuide}\n\n${MODE_PROMPTS[mode]}\n\nUse all uploaded references in the final portrait. Do not omit anyone. Arrange them naturally as a warm family photo with consistent lighting, camera perspective, and background.`,
            },
          ],
        },
      ],
      tools: {
        image_generation: openai.tools.imageGeneration({
          model: "gpt-image-2",
          quality: "high",
          outputFormat: "png",
          size: "auto",
        }),
      },
      toolChoice: { type: "tool", toolName: "image_generation" },
    })

    for (const toolResult of result.staticToolResults) {
      if (toolResult.toolName === "image_generation") {
        const base64 = (toolResult.output as { result: string }).result
        return Response.json({ image: `data:image/png;base64,${base64}` })
      }
    }

    return Response.json(
      { error: "画像の生成に失敗しました。もう一度お試しください。" },
      { status: 500 },
    )
  } catch (error) {
    console.error("[v0] Transform error:", error)
    return Response.json(
      { error: "変換中にエラーが発生しました。もう一度お試しください。" },
      { status: 500 },
    )
  }
}
