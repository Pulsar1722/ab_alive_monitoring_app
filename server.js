/**
 * @desc Webページ死活監視アプリのメインとなるファイル
 */

'use strict';

//各種パラメータ
const CRON_EVERY_MINUTE = 10; //cronによる定期実行の時間指定(分)
const MAX_REQUEST_TRY_TIMES = 3; //1回の死活監視における最大リクエスト試行回数
const MAX_REQURST_TIMEOUT_MS = 10 * 1000; //タイムアウト(単位:ms)
const CONFIG_JSON_FILENAME = "./alive_mon.json" //設定ファイルの(server.jsから見た)相対パス
let confObj = null; //設定ファイルから読みだした値のオブジェクト

//共通パラメータ
const APP_NAME = `alive_mon`; //本アプリ名
const APP_VERSION = {
    major: `1`,
    minor: `2`,
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
    //generateLog(`Entered aliveMonitoringHandler()`);
    /** 設定ファイル読み込み */
    confObj = readJsonConfigFile(CONFIG_JSON_FILENAME);
    if (confObj === null) {
        //設定ファイルを正常に読み出せなかった場合
        generateErrLog(`readJsonConfigFile(${CONFIG_JSON_FILENAME}) failed.`);
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
    confObj.dest_mail_addrs.forEach(addr => {
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
        user: confObj.src_mail_info.addr,
        pass: confObj.src_mail_info.pass,
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
        generateErrLog(error);
        jsonObj = null;
    }

    return jsonObj;
}