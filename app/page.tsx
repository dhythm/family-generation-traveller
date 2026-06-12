import { AgeTransformer } from "@/components/age-transformer"

export default function Home() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-3xl flex-col px-6 py-12 md:py-16">
      <header className="mb-12">
        <p className="mb-2 font-bold text-primary text-sm uppercase tracking-widest">3世代 タイムトラベル写真</p>
        <h1 className="font-bold text-3xl text-balance leading-tight md:text-4xl">
          家族みんなで、同じ年齢になってみよう
        </h1>
        <p className="mt-4 max-w-xl text-muted-foreground leading-relaxed">
          親・自分・子供の写真をアップロードして分類すると、選んだ世代の年齢に家族写真をそろえます。
        </p>
      </header>

      <AgeTransformer />

      <footer className="mt-16 border-foreground/20 border-t pt-6">
        <p className="text-muted-foreground text-xs leading-relaxed">
          アップロードされた写真は変換処理のみに使用され、保存されません。生成結果はAIによるイメージであり、実際の容姿を保証するものではありません。
        </p>
      </footer>
    </main>
  )
}
