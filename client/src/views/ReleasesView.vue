<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const goBack = () => {
  router.back()
}

type ReleaseItem = {
  version: string
  date: string
  title: string
  highlights: string[]
  minor: string
}

const releases: ReleaseItem[] = [
  {
    version: '1.1.0-dev',
    date: '2026-06-19',
    title: 'サービスメッセージ対応と連絡先改善',
    highlights: [
      'LINEミニアプリのサービスメッセージ通知に対応しました。',
      'お問い合わせ先にフリーダイヤル(0120-10-5449)を追加しました。',
      '代表電話(011-694-5449)を併記し、用途を分かりやすくしました。'
    ],
    minor: 'その他、レイアウト変更・軽微な修正を行いました。'
  }
]
</script>

<template>
  <div class="releases-container">
    <div class="releases-header">
      <button class="back-btn" @click="goBack">← 戻る</button>
      <h1>リリース情報</h1>
    </div>

    <div class="releases-content">
      <p class="lead">大きな変更点を中心にお知らせします。</p>

      <article v-for="release in releases" :key="release.version" class="release-card">
        <div class="release-head">
          <h2>{{ release.title }}</h2>
          <div class="meta-row">
            <span class="version">v{{ release.version }}</span>
            <span class="date">{{ release.date }}</span>
          </div>
        </div>

        <ul class="highlights">
          <li v-for="item in release.highlights" :key="item">{{ item }}</li>
        </ul>

        <p class="minor">{{ release.minor }}</p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.releases-container {
  max-width: 860px;
  margin: 0 auto;
  padding: 1.2rem 1rem 2rem;
}

.releases-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.back-btn {
  border: 1px solid #c9c9c9;
  border-radius: 18px;
  background: #fff;
  color: #444;
  padding: 0.35rem 0.9rem;
  cursor: pointer;
}

.releases-header h1 {
  margin: 0;
  font-size: 1.4rem;
  color: #2c3e50;
}

.releases-content {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.lead {
  margin: 0;
  color: #667;
  font-size: 0.9rem;
}

.release-card {
  border: 1px solid #dde2e7;
  border-radius: 10px;
  padding: 1rem;
  background: #fff;
}

.release-head {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
}

.release-head h2 {
  margin: 0;
  font-size: 1.05rem;
  color: #223;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.version {
  background: #42b883;
  color: #fff;
  border-radius: 999px;
  padding: 0.1rem 0.55rem;
  font-size: 0.78rem;
  font-weight: bold;
}

.date {
  color: #778;
  font-size: 0.78rem;
}

.highlights {
  margin: 0;
  padding-left: 1.1rem;
  color: #333;
}

.highlights li {
  margin-bottom: 0.35rem;
}

.minor {
  margin: 0.55rem 0 0;
  color: #667;
  font-size: 0.86rem;
}

@media (max-width: 768px) {
  .releases-container {
    padding: 1rem 0.8rem 1.6rem;
  }

  .releases-header h1 {
    font-size: 1.2rem;
  }
}
</style>
