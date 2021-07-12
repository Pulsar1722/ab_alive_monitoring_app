/**
 * @desc Webページ死活監視アプリのメインとなるファイル
 */

'use strict';

//各種パラメータ(Webページ死活監視)
const CRON_EVERY_MINUTE = 10; //cronによる定期実行の時間指定(分)
const ALIVE_MONITORED_URLs = [ //死活監視対象URLのリスト
    `https://kusuri-miru.com/`,
];
const MAX_REQUEST_TRY_TIMES = 3; //1回の死活監視における最大リクエスト試行回数
const MAX_REQURST_TIMEOUT_MS = 10 * 1000; //タイムアウト(単位:ms)

//各種パラメータ(通知送信)
const DEST_MAIL_ADDRs = [ //通知メールの宛先アドレスのリスト
    `mebe889@kagi.be`,
    `rgstsvc@gmail.com`,
];
const SRC_MAIL_INFO = { //送信元メールアドレス情報
    addr: `ab.robomail@gmail.com`,
    pass: `X2wvCNRH`,
}

//共通パラメータ
const APP_NAME = `alive_mon`; //本アプリ名
const APP_VERSION = {
    major: `1`,
    minor: `1`,
    revision: `1`,
}

//Webページ死活監視結果の通知内容のオブジェクト
function webPageAliveMonitoringDetail(isAlive, url, HTTPStatusCode, elapsedTime_ms, error_msg) {
    this.isAlive = isAlive; //正常応答ならtrue、異常応答ならfalse
    this.url = url; //監視対象URL
    this.HTTPResCode = HTTPStatusCode; //HTTPステータスコード
    this.elapsedTime_ms = elapsedTime_ms; //応答時間
    this.error_msg = error_msg; //エラーメッセージ
}

//使用モジュール
const cron = require('node-cron');
const axios = require('axios');
require('date-utils');

//このファイルがメインモジュールかの確認に用いるらしい
if (require.main === module) {
    main();
}

function main() {
    generateLog(`AppVersion: ${APP_VERSION.major}.${APP_VERSION.minor}.${APP_VERSION.revision}`);

    try {
        //アプリ起動直後は即座に1回実行
        generateLog(new Date().toFormat(`YYYYMMDDHH24MISS`));
        aliveMonitoringHandler();

        // cronによる周期実行
        cron.schedule(`*/${CRON_EVERY_MINUTE} * * * *`, () => {
            generateLog(new Date().toFormat(`YYYYMMDDHH24MISS`));
            aliveMonitoringHandler();
        });
    } catch (error) {
        generateErrLog(JSON.stringify(error))
    }
}


/**
 * @classdesc 死活監視処理を呼び出す関数
 */
function aliveMonitoringHandler() {
    generateLog(`Entered aliveMonitoringHandler()`);

    //Webページ死活監視処理
    ALIVE_MONITORED_URLs.forEach(async (url) => {
        let ret;
        ret = await webPageAliveMonitoring(url);
        if (!ret.isAlive) {
            sendErrNotice(ret);
        }
    });
}

/**
 * @classdesc 指定されたURLのWebページに対し、死活監視を行う関数
 * @param {string} url 死活監視対象のWebページURL
 * @return {webPageAliveMonitoringDetail} 通知内容
 */
async function webPageAliveMonitoring(url) {
    generateLog(`Entered webPageAliveMonitoring(${JSON.stringify(arguments)})`);

    let isAlive = false;
    let HTTPResCode = "N/A";
    let res = null;
    let elapsedTime_ms = 0;
    let error_msg = "";
    let startTime = 0;

    const config = {
        url: url,
        method: "GET",
        timeout: MAX_REQURST_TIMEOUT_MS,
    }

    //最大「MAX_REQUEST_TRY_TIME」回試行
    for (let i = 0; i < MAX_REQUEST_TRY_TIMES; i++) {
        try {
            startTime = new Date(); //応答時間計測開始

            //リクエストの送信とレスポンスの受信(同期的)
            res = await sendRequestSync(config);
            HTTPResCode = res.status;

            //ステータスコードは200のみを正常とする
            if (res.status !== 200) {
                generateErrLog(`${url} request[GET] error(${res.status})`);
                isAlive = false;
            } else {
                isAlive = true;
            }
        } catch (error) {
            generateErrLog(error);
            error_msg = error;
            if (error.response) {
                HTTPResCode = error.response.status;
            }
        }
        elapsedTime_ms = new Date() - startTime;  //応答時間計測終了
        generateLog(`Respose time: ${elapsedTime_ms}ms`);

        if (isAlive) {
            //1回でも正常判定なら抜ける
            generateLog(`${url} is OK.`);
            break;
        }
    }

    return new webPageAliveMonitoringDetail(isAlive, url, HTTPResCode, elapsedTime_ms, error_msg);
}

/**
 * @classdesc 異常通知を送信する関数
 * @param {webPageAliveMonitoringDetail} detail 通知内容
 * @return none
 */
function sendErrNotice(detail) {
    const mailContent = generateNoticeMailContents(detail);

    //通知メール送信処理
    DEST_MAIL_ADDRs.forEach(addr => {
        let ret;
        ret = sendMail(addr, mailContent);
        if (!ret) {
            generateErrLog(`sendMail(${addr}) failed.`);
        }
    });
}

/**
 * @classdesc 通知メールを作成する関数
 * @param {webPageAliveMonitoringDetail} detail 通知内容
 * @return {mailContent} 通知メール送信用オブジェクト(to未指定)
 */
function generateNoticeMailContents(detail) {

    const mailContent = require('gmail-send')({
        user: SRC_MAIL_INFO.addr,
        pass: SRC_MAIL_INFO.pass,
        //to: //後で指定する
        subject: `< ${APP_NAME}> Webページ異常応答！！！`,
        text:
            `以下のURLのwebページにおいて、異常応答を検出しました。\n` +
            `\n` +
            `URL: ${detail.url}\n` +
            `HTTPステータスコード: ${detail.HTTPResCode}\n` +
            `${detail.error_msg}\n` +
            `\n` +
            `管理者は、必要に応じて対象Webページのサーバ再起動等を実施してください。\n` +
            `\n` +
            `\n` +
            `AppVersion: ${APP_VERSION.major}.${APP_VERSION.minor}.${APP_VERSION.revision} `,

    });

    return mailContent;
}

/**
 * @classdesc メールを送信する関数
 * @param {string} destAddr 宛先メールアドレス
 * @param {mailContents} mailContent メールの文面
 * @return {boolean} 送信成功ならtrue、送信失敗ならfalse
 */
async function sendMail(destAddr, mailContent) {
    generateLog(`Entered sendMail(${JSON.stringify(arguments)})`);
    let isOK = false;

    try {
        const { result, fullresult } = await mailContent(
            {
                to: destAddr, //ここでtoが指定されるのをトリガーに、メールを送信する。(なんでこんなAPI仕様なんだよ！)
            }
        )
        generateLog(`gmail - send result: ${result} `);
        isOK = true;
    } catch (error) {
        generateErrLog(`gmail - send ERROR: ${error} `);
        isOK = false;
    }

    return isOK;
}




//その他関数

/**
 * @classdesc 本アプリにおける通常ログを出力する関数
 * @param {string} logstr 出力するログ文字列
 * @return none
 */
function generateLog(logstr) {
    console.log(`<${APP_NAME}> ${logstr}`);
}

/**
 * @classdesc 本アプリにおける異常ログを出力する関数
 * @param {string} logstr 出力するログ文字列
 * @return none
 */
function generateErrLog(logstr) {
    console.error(`<${APP_NAME}> ${logstr}`);
}

/**
 * @classdesc 同期的にリクエストを送信する関数
 * @param config Request Config
 * @return axiosのresponse
 */
async function sendRequestSync(config) {
    return await axios(config);
}