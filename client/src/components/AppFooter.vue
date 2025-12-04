<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
    <footer class="app-footer">
        <div class="footer-content">
            <p class="footer-copyright">&copy; 2025 ヘアーサロン Joy's 予約システム</p>
            <div class="footer-links">
                <RouterLink to="/terms" class="footer-link">利用規約</RouterLink>
                <span class="footer-divider">|</span>
                <RouterLink to="/privacy" class="footer-link">プライバシーポリシー</RouterLink>
            </div>
            <p class="footer-credit">効果音: <a href="https://otologic.jp" target="_blank" rel="noopener noreferrer" class="footer-link">OtoLogic</a></p>
        </div>
    </footer>
</template>

<style scoped>
.app-footer {
    background-color: #f8f9fa;
    border-top: 1px solid #e0e0e0;
    padding: 1rem 0;
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
    gap: 0.5rem;
}

.footer-copyright {
    color: #666;
    font-size: 0.85rem;
    margin: 0;
}

.footer-credit {
    color: #666;
    font-size: 0.75rem;
    margin: 0;
}

.footer-links {
    display: flex;
    align-items: center;
    gap: 0.5rem;
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
    .footer-content {
        flex-direction: column;
        text-align: center;
        gap: 0.75rem;
    }

    .footer-copyright {
        font-size: 0.8rem;
    }

    .footer-links {
        font-size: 0.8rem;
    }

    .footer-credit {
        font-size: 0.7rem;
    }

    .footer-link {
        font-size: 0.8rem;
    }
}
</style>
