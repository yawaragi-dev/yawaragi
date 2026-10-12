import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'
import { romajiKey, looseRomajiKey } from '@/lib/sakenowa/romaji-key'

const OLD = `You produce a single-line Latin-alphabet (Hepburn romanisation) display name for a Japanese sake brand or brewery.
Rules:
- Use Hepburn romanisation with macrons OMITTED — plain ASCII letters only.
- Title Case the name ("Asahi Shuzo", "Kubota", "Hakkaisan").
- Strip legal-form suffixes from brewery names. KEEP operational suffixes: 酒造 → "Shuzo", 醸造 → "Jozo".
- Do not add explanatory text — just the single Hepburn name.
Examples: 獺祭 → Dassai; 旭酒造 → Asahi Shuzo; 八海醸造 → Hakkai Jozo; 黒龍 → Kokuryu`
const NEW = `You give the Latin-alphabet name of a Japanese sake or sake brewery, as the brewery itself writes it.

These are proper names with fixed readings, and many are irregular. Do not read the kanji one at a time. If you recognise the sake or the brewery — from the name, the brewery and the prefecture given — use its real reading: 十四代 is Juyondai, 新政 is Aramasa, 而今 is Jikon, 飛露喜 is Hiroki, 醸し人九平次 is Kamoshibito Kuheiji, 作 is Zaku. Compounds usually voice their second word: 樽酒 is Taruzake, 酒蔵 is Sakagura.

Format: Hepburn, plain ASCII, no macrons, Title Case, words separated the way the name is said ("Koshi no Kanbai", "Nanbu Bijin"). For a brewery, drop legal forms (株式会社 and the like) and keep 酒造 as "Shuzo", 醸造 as "Jozo", 酒造店 as "Shuzoten", 商店 as "Shoten". Only the name, nothing else.`
const schema = z.object({ romaji: z.string().min(1) })

type Item = { kanji: string; truth: string; kind: 'sake' | 'brewery'; brewery?: string; pref?: string }
const S = (kanji: string, truth: string, brewery: string, pref: string): Item => ({ kanji, truth, kind: 'sake', brewery, pref })
const B = (kanji: string, truth: string, pref: string): Item => ({ kanji, truth, kind: 'brewery', pref })
const items: Item[] = [
  S('李白','Rihaku','李白酒造','島根'), S('天吹','Amabuki','天吹酒造','佐賀'), S('別格','Bekkaku','角星','宮城'), S('両國','Ryogoku','角星','宮城'),
  S('吉野杉の樽酒','Yoshinosugi no Taruzake','長龍酒造','奈良'), S('達磨正宗','Daruma Masamune','白木恒助商店','岐阜'), S('出羽桜','Dewazakura','出羽桜酒造','山形'),
  S('不動','Fudo','鍋店','千葉'), S('あわ咲き','Awasaki','神戸酒心館','兵庫'), S('福寿','Fukuju','神戸酒心館','兵庫'), S('花巴','Hanatomoe','美吉野醸造','奈良'),
  S('池亀','Ikekame','池亀酒造','福岡'), S('黒兜','Kurokabuto','池亀酒造','福岡'), S('勝山','Katsuyama','仙台伊澤家 勝山酒造','宮城'), S('白川郷','Shirakawago','三輪酒造','岐阜'),
  S('人気一','Ninkiichi','人気酒造','福島'), S('臥龍梅','Garyubai','三和酒造','静岡'), S('澤の花','Sawa no Hana','伴野酒造','長野'), S('七賢','Shichiken','山梨銘醸','山梨'),
  S('山形正宗','Yamagata Masamune','水戸部酒造','山形'), S('瑞鷹','Zuiyo','瑞鷹酒造','熊本'), S('黄桜','Kizakura','黄桜','京都'), S('越乃寒梅','Koshi no Kanbai','石本酒造','新潟'),
  S('南部美人','Nanbu Bijin','南部美人','岩手'), S('沢の鶴','Sawanotsuru','沢の鶴','兵庫'), S('谷川岳','Tanigawadake','永井酒造','群馬'), S('川鶴','Kawatsuru','川鶴酒造','香川'),
  S('雪の十和田','Yuki no Towada','北鹿','秋田'), S('水芭蕉','Mizubasho','永井酒造','群馬'), S('武尊の雪','Hotaka no Yuki','永井酒造','群馬'), S('小天狗','Kotengu','北鹿','秋田'),
  B('李白酒造','Rihaku Shuzo','島根'), B('天吹酒造','Amabuki Shuzo','佐賀'), B('角星','Kakuboshi','宮城'), B('長龍酒造','Choryo Shuzo','奈良'), B('白木恒助商店','Shiraki Tsunesuke Shoten','岐阜'),
  B('出羽桜酒造','Dewazakura Shuzo','山形'), B('鍋店','Nabedana','千葉'), B('神戸酒心館','Kobe Shushinkan','兵庫'), B('美吉野醸造','Miyoshino Jozo','奈良'), B('北鹿','Hokushika','秋田'),
  B('池亀酒造','Ikekame Shuzo','福岡'), B('三輪酒造','Miwa Shuzo','岐阜'), B('人気酒造','Ninki Shuzo','福島'), B('清洲桜醸造','Kiyosuzakura Jozo','愛知'), B('三和酒造','Sanwa Shuzo','静岡'),
  B('伴野酒造','Tomono Shuzo','長野'), B('世嬉の一酒造','Sekinoichi Shuzo','岩手'), B('山梨銘醸','Yamanashi Meijo','山梨'), B('水戸部酒造','Mitobe Shuzo','山形'), B('瑞鷹酒造','Zuiyo Shuzo','熊本'),
  B('石本酒造','Ishimoto Shuzo','新潟'), B('永井酒造','Nagai Shuzo','群馬'), B('川鶴酒造','Kawatsuru Shuzo','香川'),
]
async function ask(model: string, system: string, item: Item, context: boolean) {
  const content = context
    ? `${item.kind === 'sake' ? 'Sake' : 'Brewery'}: ${item.kanji}\n${item.kind === 'sake' ? `Brewery: ${item.brewery}\n` : ''}Prefecture: ${item.pref}`
    : item.kanji
  const r = await generateObject({ model: anthropic(model), schema, system, messages: [{ role: 'user', content }] })
  return { romaji: r.object.romaji.trim(), usage: r.usage }
}
async function main() {
  const configs: [string, string, string, boolean][] = [
    ['haiku-4-5 old prompt', 'claude-haiku-4-5', OLD, false],
    ['haiku-5-5 old prompt', 'claude-haiku-5-5', OLD, false],
    ['haiku-5-5 new prompt+context', 'claude-haiku-5-5', NEW, true],
    ['sonnet-5-5 new prompt+context', 'claude-sonnet-5-5', NEW, true],
  ]
  for (const [label, model, system, ctx] of configs) {
    let ok = 0, loose = 0, tin = 0, tout = 0; const wrong: string[] = []
    const queue = [...items]
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (let it = queue.shift(); it; it = queue.shift()) {
        try {
          const { romaji, usage } = await ask(model, system, it, ctx)
          tin += usage.inputTokens ?? 0; tout += usage.outputTokens ?? 0
          if (romajiKey(romaji) === romajiKey(it.truth)) ok++
          else { if (looseRomajiKey(romaji) === looseRomajiKey(it.truth)) loose++; wrong.push(`${it.kanji}→${romaji} (want ${it.truth})`) }
        } catch (e) { wrong.push(`${it.kanji}→ERROR ${(e as Error).name}`) }
      }
    }))
    console.log(`${label}: ${ok}/${items.length} right (+${loose} differing only in voicing) | tokens in ${tin} out ${tout}`)
    console.log('   ' + wrong.join(' | '))
  }
}
main().then(() => process.exit(0))
