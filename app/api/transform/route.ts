import { openai } from "@ai-sdk/openai"
import { generateText } from "ai"

export const maxDuration = 300

type Mode = "child" | "self" | "parent"

const MODE_PROMPTS: Record<Mode, string> = {
  child: `Edit this multi-generational family photo so that EVERY person in the photo appears as a young child, approximately 5 to 7 years old. Transform each person's face and body to look like a natural, realistic child version of themselves, preserving their unique facial features, identity, hairstyle color, skin tone, glasses if any, and expressions so each person is still recognizable as a child version of themselves. Keep the exact same composition, poses, positions, clothing style (scaled to child size), background, and lighting. Photorealistic result.`,
  self: `Edit this multi-generational family photo so that EVERY person in the photo appears as an adult in their mid-30s. Transform each person's face and body to look like a natural, realistic mid-30s adult version of themselves, preserving their unique facial features, identity, hairstyle color, skin tone, glasses if any, and expressions so each person is still recognizable. Keep the exact same composition, poses, positions, clothing style, background, and lighting. Photorealistic result.`,
  parent: `Edit this multi-generational family photo so that EVERY person in the photo appears as a senior, approximately 65 to 70 years old. Transform each person's face and body to look like a natural, realistic senior version of themselves with gray hair and age-appropriate features, preserving their unique facial features, identity, skin tone, glasses if any, and expressions so each person is still recognizable. Keep the exact same composition, poses, positions, clothing style, background, and lighting. Photorealistic result.`,
}

export async function POST(req: Request) {
  try {
    const { image, mode } = (await req.json()) as {
      image?: string
      mode?: Mode
    }

    if (!image || !mode || !MODE_PROMPTS[mode]) {
      return Response.json(
        { error: "画像と変換モードを指定してください。" },
        { status: 400 },
      )
    }

    const result = await generateText({
      model: "openai/gpt-5.1-instant",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image },
            { type: "text", text: MODE_PROMPTS[mode] },
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
