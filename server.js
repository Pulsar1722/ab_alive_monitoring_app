/**
 * @desc Webページ死活監視アプリのメインとなるファイル
 */

'use strict';

//各種パラメータ
const MAX_REQUEST_TRY_TIMES = 3; //1回の死活監視における最大リクエスト試行回数
const ALIVE_MON_TRY_INTERVAL_MS = 1 * 1000; //死活監視通信のインターバル(単位:ms)
const MAX_REQURST_TIMEOUT_MS = 10 * 1000; //1回の死活監視通信のタイムアウト(単位:ms)
const CONFIG_JSON_FILENAME = "./alive_mon.json"; //設定ファイルの(server.jsから見た)相対パス
let confObj = null; //設定ファイルから読みだした値のオブジェクト

const CRON_FORMAT_WEBPAGE_ALIVE_MONITORING = `*/20 * * * *`; //Webページ死活監視処理のCRONフォーマット(20分おき)
const CRON_FORMAT_REGULARY_NOTICE = `0 3 1 * *`; //定期連絡処理のCRONフォーマット(毎月1日 UTC 03:00)

//共通パラメータ
const APP_NAME = `alive_mon`; //本アプリ名
const APP_VERSION = {
    major: `1`,
    minor: `3`,
    revision: `0`,
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
const { DateTime } = require("luxon"); //時刻を取得。date-utilsより使いやすい

/**
 * スリープ関数(awaitで待ち受ける必要あり)
 * @param {Number} msec -待機時間(ms) 
 * @returns none(Promise型のオブジェクトを返すけど別に重要じゃない)
 */
const sleep = msec => new Promise(resolve => setTimeout(resolve, msec));

//このファイルがメインモジュールかの確認に用いるらしい
if (require.main === module) {
    main();
}

function main() {
    printLog(`AppVersion: ${APP_VERSION.major}.${APP_VERSION.minor}.${APP_VERSION.revision}`);

    try {
        //アプリ起動直後は死活監視を即座に1回実行
        aliveMonitoringHandler();

        // 死活監視処理の周期実行
        cron.schedule(CRON_FORMAT_WEBPAGE_ALIVE_MONITORING, () => {
            aliveMonitoringHandler();
        });

        // 死活監視アプリが正常に動作していることを通知する処理の周期実行
        cron.schedule(CRON_FORMAT_REGULARY_NOTICE, () => {
            sendRegularyNoticeHandler();
        });
    } catch (error) {
        printErrLog(JSON.stringify(error))
    }
}


/**
 * @classdesc 死活監視処理を呼び出す関数
 */
function aliveMonitoringHandler() {
    //generateLog(`Entered aliveMonitoringHandler()`);

    //タイムスタンプ出力
    let recordDateTime = DateTime.now().setZone('Asia/Tokyo');
    printLog(recordDateTime.toISO());

    /** 設定ファイル読み込み */
    confObj = readJsonConfigFile(CONFIG_JSON_FILENAME);
    if (confObj === null) {
        //設定ファイルを正常に読み出せなかった場合
        printErrLog(`readJsonConfigFile(${CONFIG_JSON_FILENAME}) failed.`);
        return;
    }

    //Webページ死活監視処理
    confObj.alive_monitored_URLs.forEach(async (url) => {
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
    printLog(`Entered webPageAliveMonitoring(${JSON.stringify(arguments)})`);

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
            startTime = DateTime.now(); //応答時間計測開始

            //リクエストの送信とレスポンスの受信(同期的)
            res = await sendRequestSync(config);
            HTTPResCode = res.status;

            //ステータスコードは200のみを正常とする
            if (res.status !== 200) {
                printErrLog(`${url} request[GET] error(${res.status})`);
                isAlive = false;
            } else {
                isAlive = true;
            }
        } catch (error) {
            printErrLog(error);
            error_msg = error;
            if (error.response) {
                HTTPResCode = error.response.status;
            }
        }
        elapsedTime_ms = DateTime.now() - startTime;  //応答時間計測終了
        printLog(`Respose time: ${elapsedTime_ms}ms`);

        if (isAlive) {
            //1回でも正常判定なら抜ける
            printLog(`${url} is OK.`);
            break;
        }

        // 死活監視通信に失敗した場合、次の死活監視通信を開始するまでインターバルをとる
        await sleep(ALIVE_MON_TRY_INTERVAL_MS);
    }

    return new webPageAliveMonitoringDetail(isAlive, url, HTTPResCode, elapsedTime_ms, error_msg);
}

/**
 * @classdesc 異常通知を送信する関数
 * @param {webPageAliveMonitoringDetail} detail 通知内容
 * @return none
 */
function sendErrNotice(detail) {
    const mailContent = generateErrNoticeMailContents(detail);

    //通知メール送信処理
    confObj.dest_mail_addrs.forEach(addr => {
        let ret;
        ret = sendMail(addr, mailContent);
        if (!ret) {
            printErrLog(`sendMail(${addr}) failed.`);
        }
    });
}

/**
 * @classdesc Webページ応答異常時の通知メールを作成する関数
 * @param {webPageAliveMonitoringDetail} detail 通知内容
 * @return {mailContent} 通知メール送信用オブジェクト(to未指定)
 */
function generateErrNoticeMailContents(detail) {

    const mailContent = require('gmail-send')({
        user: confObj.src_mail_info.addr,
        pass: confObj.src_mail_info.pass,
        //to: //後で指定する
        subject: `<${APP_NAME}> Webページ異常応答！！！`,
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
 * @classdesc 死活監視アプリ稼働状況の定期連絡を実施する関数
 * @param {webPageAliveMonitoringDetail} detail 通知内容
 * @return none
 */
function sendRegularyNoticeHandler() {
    const mailContent = generateRegularyNoticeMailContents();

    //通知メール送信処理
    confObj.dest_mail_addrs.forEach(addr => {
        let ret;
        ret = sendMail(addr, mailContent);
        if (!ret) {
            printErrLog(`sendMail(${addr}) failed.`);
        }
    });
}

/**
 * @classdesc 定期連絡用通知メールを作成する関数
 * @param none
 * @return {mailContent} 通知メール送信用オブジェクト(to未指定)
 */
function generateRegularyNoticeMailContents() {

    const mailContent = require('gmail-send')({
        user: confObj.src_mail_info.addr,
        pass: confObj.src_mail_info.pass,
        //to: //後で指定する
        subject: `<${APP_NAME}> 死活監視状況の定期連絡`,
        text:
            `本メールは、死活監視アプリが正常に動作していることを確認するための定期連絡用メールです。\n` +
            `本メールが届くことは正常であり、異常動作ではありません。\n` +
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
    printLog(`Entered sendMail(${JSON.stringify(arguments)})`);
    let isOK = false;

    try {
        const { result, fullresult } = await mailContent(
            {
                to: destAddr, //ここでtoが指定されるのをトリガーに、メールを送信する。(なんでこんなAPI仕様なんだよ！)
            }
        )
        printLog(`gmail - send result: ${result} `);
        isOK = true;
    } catch (error) {
        printErrLog(`gmail - send ERROR: ${error} `);
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
function printLog(logstr) {
    console.log(`<${APP_NAME}> ${logstr}`);
}

/**
 * @classdesc 本アプリにおける異常ログを出力する関数
 * @param {string} logstr 出力するログ文字列
 * @return none
 */
function printErrLog(logstr) {
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

/**
 * @classdesc 設定ファイル(JSON形式)を読み出し、各種設定値を取得する。設定値が正常に読み出せたか(足りない設定値はないか)
 * @param {string} jsonFilename JSON形式の設定ファイルパス
 * @return 正常に設定ファイルを読み出せた場合はJSONオブジェクト。そうでない場合はnull
 */
function readJsonConfigFile(jsonFilePath) {
    let jsonObj = null;
    let undefinedParams = [];

    try {
        //ファイルパスが異常なら、ここでエラーをthrowする
        jsonObj = require(jsonFilePath);
        delete require.cache[require.resolve(jsonFilePath)]; //ここでrequireのキャッシュを削除し、次回以降も再度ファイルを読み出すようにする

        /**以下、設定値の確認 */
        if (jsonObj.alive_monitored_URLs === undefined) {
            undefinedParams.push("alive_monitored_URLs");
        }

        if (jsonObj.dest_mail_addrs === undefined) {
            undefinedParams.push("dest_mail_addrs");
        }

        if (jsonObj.src_mail_info === undefined) {
            undefinedParams.push("src_mail_info");
        } else {
            //サブパラメータについても確認
            if (jsonObj.src_mail_info.addr === undefined) {
                undefinedParams.push("src_mail_info.addr");
            }
            if (jsonObj.src_mail_info.pass === undefined) {
                undefinedParams.push("src_mail_info.pass");
            }
        }

        // 1個以上のパラメータが設定されていなければエラー扱い
        if (undefinedParams.length !== 0) {
            throw `${undefinedParams} is undefined.`
        }
    } catch (error) {
        printErrLog(error);
        jsonObj = null;
    }

    return jsonObj;
}