/**
 * @desc Webページ死活監視アプリのメインとなるファイル
 */

'use strict';

//各種パラメータ
const CRON_INTERVAL_MINUTE = 10; //cronによる定期実行の間隔(分)
const aliveMonitoredURL = [ //死活監視対象URLのリスト
    "https://kusuri-miru.com/",
];
const send_mail_addrs = [ //通知メールの宛先アドレスのリスト
    "mebe889@kagi.be",
];

//共通パラメータ
const APP_NAME = "alive_mon"; //本アプリ名

//メールの文面のオブジェクト
function mailContents(subject, text) {
    this.subject = subject; //件名
    this.text = text; //本文(not HTML)
}

//Webページ死活監視結果の通知内容のオブジェクト
function webPageAliveMonitoringDetail(isAlive, url, HTTPResCode) {
    this.isAlive = isAlive; //正常応答ならtrue、異常応答ならfalse
    this.url = url; //監視対象URL
    this.HTTPResCode = HTTPResCode; //HTTPレスポンスステータスコード
}

const cron = require('node-cron');

// cronによる自動実行
cron.schedule('*/' + CRON_INTERVAL_MINUTE + ' * * * *', aliveMonitoringHandler());




/**
 * @classdesc 死活監視処理を呼び出す関数
 */
function aliveMonitoringHandler() {
    generateLog("Entered " + arguments.callee.name);

    //Webページ死活監視処理
    aliveMonitoredURL.forEach(url => {
        let ret;
        ret = webPageAliveMonitoring(url);
        if (!ret.isAlive) {
            sendNotice(ret);
        }
    });
}

/**
 * @classdesc 指定されたURLのWebページに対し、死活監視を行う関数
 * @param {string} url 死活監視対象のWebページURL
 * @return {webPageAliveMonitoringDetail} 正常判定ならtrue、異常判定ならfalse/HTTPレスポンスステータスコード
 */
function webPageAliveMonitoring(url) {
    generateLog("Entered " + arguments.callee.name);

    let isAlive = false;
    let HTTPResCode = 500;

    return new webPageAliveMonitoringDetail(isAlive, url, HTTPResCode);
}

/**
 * @classdesc 通知を送信する関数
 * @param {webPageAliveMonitoringDetail} detail 通知内容
 * @return none
 */
function sendNotice(detail) {
    const mailContent = generateNoticeMailText(detail);

    //通知メール送信処理
    send_mail_addrs.forEach(addr => {
        let ret;
        ret = sendMail(addr, mailContent);
        if (!ret) {
            generateLog("sendMail() 送信エラー 宛先:" + addr);
        }
    });
}

/**
 * @classdesc 通知メールを作成する関数
 * @param {webPageAliveMonitoringDetail} detail 通知内容
 * @return {mailContents} 通知メールの文面
 */
function generateNoticeMailText(detail) {
    let mailContent = new mailContents();

    mailContent.subject = "<" + APP_NAME + "> Webページ異常応答！！！"
    mailContent.text =
        "以下のURLのwebページにおいて、異常応答を検出しました。\n" +
        "\n" +
        "URL: " + url + "\n" +
        "HTTPレスポンスコード" + HTTPResCode + "\n" +
        "\n" +
        "管理者は、必要に応じて対象Webページのサーバ再起動等を実施してください\n"

    return mailContent;
}

/**
 * @classdesc メールを送信する関数
 * @param {string} destAddr 宛先メールアドレス
 * @param {mailContents} mailContent メールの文面
 * @return {boolean} 送信成功ならtrue、送信失敗ならfalse
 */
function sendMail(destAddr, mailContent) {

}




//その他関数

/**
 * @classdesc 本アプリにおけるログを出力する関数
 * @param {string} logstr 出力するログ文字列
 * @return none
 */
function generateLog(logstr) {
    console.log("<" + APP_NAME + ">" + logstr);
}