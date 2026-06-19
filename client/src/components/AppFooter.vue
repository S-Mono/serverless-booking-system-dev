<script setup lang="ts">
import { RouterLink } from 'vue-router'

const appVersion = __APP_VERSION__
</script>

<template>
    <footer class="app-footer">
        <div class="footer-content">
            <p class="footer-copyright">&copy; 2025 ヘアーサロン JOY's 予約システム <span class="footer-version">v{{ appVersion }}</span></p>
            <div class="footer-links">
                <RouterLink to="/terms" class="footer-link">利用規約</RouterLink>
                <span class="footer-divider">|</span>
                <RouterLink to="/privacy" class="footer-link">プライバシーポリシー</RouterLink>
                <span class="footer-divider">|</span>
                <RouterLink to="/releases" class="footer-link">リリース情報</RouterLink>
                <span class="footer-divider">|</span>
                <RouterLink to="/support" class="footer-link">カスタマーサポート</RouterLink>
            </div>
            <p class="footer-credit">効果音: <a href="https://otologic.jp" target="_blank" rel="noopener noreferrer"
                    class="footer-link">OtoLogic</a></p>
        </div>
    </footer>
</template>

<style scoped>
.app-footer {
    background-color: #f8f9fa;
    border-top: 1px solid #e0e0e0;
    padding: 0.5rem 0 calc(0.5rem + env(safe-area-inset-bottom, 0px) + 4px);
    margin-top: auto;
}

.footer-content {
    max-width: 1024px;
    margin: 0 auto;
    padding: 0 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
}

.footer-copyright {
    color: #666;
    font-size: 0.85rem;
    line-height: 1.2;
    margin: 0;
}

.footer-credit {
    color: #666;
    font-size: 0.75rem;
    line-height: 1.2;
    margin: 0;
}

.footer-version {
    color: #9aa0a6;
    font-size: 0.65rem;
    margin-left: 0.4rem;
}

.footer-links {
    display: flex;
    align-items: center;
    gap: 0.35rem;
}

.footer-link {
    color: #666;
    text-decoration: none;
    font-size: 0.85rem;
    transition: color 0.2s;
}

.footer-link:hover {
    color: #42b883;
    text-decoration: underline;
}

.footer-divider {
    color: #ccc;
    font-size: 0.85rem;
}

@media (max-width: 768px) {
    .app-footer {
        padding: 0.25rem 0 calc(env(safe-area-inset-bottom, 0px) + 6px);
        min-height: calc(
            (0.8rem * 1.2) +
            (0.8rem * 1.2) +
            (0.7rem * 1.2) +
            (0.35rem * 2) +
            0.25rem +
            env(safe-area-inset-bottom, 0px) +
            6px
        );
    }

    .footer-content {
        flex-direction: column;
        text-align: center;
        gap: 0.35rem;
    }

    .footer-copyright {
        font-size: 0.8rem;
        line-height: 1.2;
    }

    .footer-links {
        font-size: 0.8rem;
        line-height: 1.2;
    }

    .footer-credit {
        font-size: 0.7rem;
        line-height: 1.2;
    }

    .footer-link {
        font-size: 0.8rem;
    }
}
</style>
