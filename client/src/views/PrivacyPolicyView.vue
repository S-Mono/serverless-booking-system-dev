<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const goBack = () => {
    router.back()
}
</script>

<template>
    <div class="privacy-container">
        <div class="privacy-header">
            <button class="back-btn" @click="goBack">← 戻る</button>
            <h1>プライバシーポリシー</h1>
        </div>

        <div class="privacy-content">
            <p class="updated-date">最終更新日: 2025年12月3日</p>

            <section>
                <p>
                    当サービス運営者(以下「当社」といいます)は、本サービスにおけるユーザーの個人情報の取扱いについて、以下のとおりプライバシーポリシー(以下「本ポリシー」といいます)を定めます。
                </p>
            </section>

            <section>
                <h2>第1条(収集する情報)</h2>
                <p>当社は、本サービスの提供にあたり、以下の情報を収集します。</p>
                <ol>
                    <li><strong>ユーザーが提供する情報</strong>
                        <ul>
                            <li>氏名(フリガナ)</li>
                            <li>電話番号</li>
                            <li>メールアドレス</li>
                            <li>予約に関する情報(日時、メニュー等)</li>
                        </ul>
                    </li>
                    <li><strong>自動的に収集される情報</strong>
                        <ul>
                            <li>IPアドレス</li>
                            <li>アクセス日時</li>
                            <li>ブラウザの種類およびバージョン</li>
                            <li>デバイス情報</li>
                            <li>Cookie情報</li>
                        </ul>
                    </li>
                    <li><strong>外部サービス連携により収集される情報</strong>
                        <ul>
                            <li>LINE連携時のユーザーID</li>
                            <li>プロフィール情報(氏名、プロフィール画像等)</li>
                        </ul>
                    </li>
                </ol>
            </section>

            <section>
                <h2>第2条(利用目的)</h2>
                <p>当社は、収集した個人情報を以下の目的で利用します。</p>
                <ul>
                    <li>本サービスの提供、運営のため</li>
                    <li>予約の確認、変更、キャンセル対応のため</li>
                    <li>ユーザーからのお問い合わせに対応するため</li>
                    <li>サービスに関する重要なお知らせや通知を送信するため</li>
                    <li>利用規約に違反したユーザーや、不正・不当な目的でサービスを利用しようとするユーザーの特定をし、ご利用をお断りするため</li>
                    <li>本サービスの改善、新機能の開発のため</li>
                    <li>アクセス状況やユーザー行動の分析・統計データの作成のため</li>
                    <li>上記の利用目的に付随する目的</li>
                </ul>
            </section>

            <section>
                <h2>第3条(個人情報の第三者提供)</h2>
                <ol>
                    <li>当社は、次に掲げる場合を除いて、あらかじめユーザーの同意を得ることなく、第三者に個人情報を提供することはありません。
                        <ul>
                            <li>法令に基づく場合</li>
                            <li>人の生命、身体または財産の保護のために必要がある場合であって、本人の同意を得ることが困難であるとき</li>
                            <li>公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合であって、本人の同意を得ることが困難であるとき</li>
                            <li>国の機関もしくは地方公共団体またはその委託を受けた者が法令の定める事務を遂行することに対して協力する必要がある場合であって、本人の同意を得ることにより当該事務の遂行に支障を及ぼすおそれがあるとき
                            </li>
                        </ul>
                    </li>
                    <li>前項の定めにかかわらず、次に掲げる場合には、当該情報の提供先は第三者に該当しないものとします。
                        <ul>
                            <li>当社が利用目的の達成に必要な範囲内において個人情報の取扱いの全部または一部を委託する場合</li>
                            <li>合併その他の事由による事業の承継に伴って個人情報が提供される場合</li>
                        </ul>
                    </li>
                </ol>
            </section>

            <section>
                <h2>第4条(個人情報の開示)</h2>
                <ol>
                    <li>当社は、本人から個人情報の開示を求められたときは、本人に対し、遅滞なくこれを開示します。ただし、開示することにより次のいずれかに該当する場合は、その全部または一部を開示しないこともあり、開示しない決定をした場合には、その旨を遅滞なく通知します。
                        <ul>
                            <li>本人または第三者の生命、身体、財産その他の権利利益を害するおそれがある場合</li>
                            <li>当社の業務の適正な実施に著しい支障を及ぼすおそれがある場合</li>
                            <li>その他法令に違反することとなる場合</li>
                        </ul>
                    </li>
                    <li>前項の定めにかかわらず、履歴情報および特性情報などの個人情報以外の情報については、原則として開示いたしません。</li>
                </ol>
            </section>

            <section>
                <h2>第5条(個人情報の訂正および削除)</h2>
                <ol>
                    <li>ユーザーは、当社の保有する自己の個人情報が誤った情報である場合には、当社が定める手続きにより、当社に対して個人情報の訂正、追加または削除(以下「訂正等」といいます)を請求することができます。
                    </li>
                    <li>当社は、ユーザーから前項の請求を受けてその請求に応じる必要があると判断した場合には、遅滞なく、当該個人情報の訂正等を行うものとします。</li>
                    <li>当社は、前項の規定に基づき訂正等を行った場合、または訂正等を行わない旨の決定をしたときは遅滞なく、これをユーザーに通知します。</li>
                </ol>
            </section>

            <section>
                <h2>第6条(個人情報の利用停止等)</h2>
                <ol>
                    <li>当社は、本人から、個人情報が、利用目的の範囲を超えて取り扱われているという理由、または不正の手段により取得されたものであるという理由により、その利用の停止または消去(以下「利用停止等」といいます)を求められた場合には、遅滞なく必要な調査を行います。
                    </li>
                    <li>前項の調査結果に基づき、その請求に応じる必要があると判断した場合には、遅滞なく、当該個人情報の利用停止等を行います。</li>
                    <li>当社は、前項の規定に基づき利用停止等を行った場合、または利用停止等を行わない旨の決定をしたときは、遅滞なく、これをユーザーに通知します。</li>
                </ol>
            </section>

            <section>
                <h2>第7条(Cookieおよび類似技術の使用)</h2>
                <ol>
                    <li>当社は、本サービスの利便性向上およびサービス改善のため、Cookieおよび類似の技術を使用することがあります。</li>
                    <li>ユーザーは、ブラウザの設定によりCookieの受け取りを拒否することができます。ただし、Cookieを拒否した場合、本サービスの一部機能が利用できなくなる場合があります。</li>
                </ol>
            </section>

            <section>
                <h2>第8条(外部サービスの利用)</h2>
                <p>本サービスでは、以下の外部サービスを利用しています。各サービスのプライバシーポリシーについては、各事業者のウェブサイトをご確認ください。</p>
                <ul>
                    <li><strong>Firebase (Google LLC)</strong>: 認証、データベース、ホスティング</li>
                    <li><strong>LINE</strong>: ソーシャルログイン機能</li>
                </ul>
            </section>

            <section>
                <h2>第9条(アクセス解析ツール)</h2>
                <p>
                    当社は、本サービスの利用状況を把握するために、アクセス解析ツールを使用することがあります。アクセス解析ツールは、トラフィックデータの収集のためにCookieを使用することがあります。このトラフィックデータは匿名で収集されており、個人を特定するものではありません。
                </p>
            </section>

            <section>
                <h2>第10条(個人情報の安全管理)</h2>
                <p>
                    当社は、個人情報の紛失、破壊、改ざんおよび漏洩などのリスクに対して、個人情報の安全管理が図られるよう、当社の従業員に対し、必要かつ適切な監督を行います。また、当社は、個人情報の取扱いの全部または一部を委託する場合は、委託先において個人情報の安全管理が図られるよう、必要かつ適切な監督を行います。
                </p>
            </section>

            <section>
                <h2>第11条(プライバシーポリシーの変更)</h2>
                <ol>
                    <li>本ポリシーの内容は、法令その他本ポリシーに別段の定めのある事項を除いて、ユーザーに通知することなく、変更することができるものとします。</li>
                    <li>当社が別途定める場合を除いて、変更後のプライバシーポリシーは、本ウェブサイトに掲載したときから効力を生じるものとします。</li>
                </ol>
            </section>

            <section>
                <h2>第12条(お問い合わせ窓口)</h2>
                <p>
                    本ポリシーに関するお問い合わせは、本サービス内のお問い合わせフォームまたはメッセージ機能をご利用ください。
                </p>
            </section>

            <div class="privacy-footer">
                <p>以上</p>
            </div>
        </div>
    </div>
</template>

<style scoped>
.privacy-container {
    max-width: 800px;
    margin: 0 auto;
    height: calc(100vh - 60px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.privacy-content {
    flex: 1;
    overflow-y: auto;
    padding: 0 1rem 2rem;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
}

.privacy-content::-webkit-scrollbar {
    width: 6px;
}

.privacy-content::-webkit-scrollbar-track {
    background: transparent;
}

.privacy-content::-webkit-scrollbar-thumb {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
}

.privacy-header {
    flex-shrink: 0;
    padding: 1.5rem 1rem 1rem;
    margin-bottom: 0;
    position: relative;
}

.back-btn {
    background: #42b883;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
    margin-bottom: 1rem;
}

.back-btn:hover {
    background: #35a372;
}

.privacy-header h1 {
    font-size: 2rem;
    color: #333;
    margin-bottom: 0.5rem;
}

.updated-date {
    color: #666;
    font-size: 0.9rem;
    margin-bottom: 2rem;
}

.privacy-content {
    line-height: 1.8;
    color: #333;
}

.privacy-content section {
    margin-bottom: 2.5rem;
}

.privacy-content h2 {
    font-size: 1.3rem;
    color: #333;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #42b883;
}

.privacy-content p {
    margin-bottom: 1rem;
}

.privacy-content ol,
.privacy-content ul {
    margin-left: 1.5rem;
    margin-bottom: 1rem;
}

.privacy-content li {
    margin-bottom: 0.5rem;
}

.privacy-content ul ul {
    margin-top: 0.5rem;
    list-style-type: circle;
}

.privacy-content strong {
    color: #333;
    font-weight: 600;
}

.privacy-footer {
    text-align: right;
    margin-top: 3rem;
    padding-top: 2rem;
    border-top: 1px solid #ddd;
    color: #666;
}

@media (max-width: 768px) {
    .privacy-container {
        padding: 1rem;
    }

    .privacy-header h1 {
        font-size: 1.5rem;
    }

    .privacy-content h2 {
        font-size: 1.1rem;
    }

    .privacy-content {
        font-size: 0.9rem;
    }
}
</style>
