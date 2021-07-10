/**
 * @desc Webページ死活監視アプリのメインとなるファイル
 */

'use strict';

//各種パラメータ(Webページ死活監視)
const CRON_INTERVAL_MINUTE = 10; //cronによる定期実行の間隔(分)
const aliveMonitoredURL = [ //死活監視対象URLのリスト
    "https://kusuri-miru.com/",
];
const MAX_REQUEST_TRY_TIME = 3; //1回の死活監視における最大試行回数
const MAX_REQURST_TIMEOUT_MS = 10 * 1000; //タイムアウト(単位:ms)

//各種パラメータ(通知送信)
const send_mail_addrs = [ //通知メールの宛先アドレスのリスト
    "mebe889@kagi.b",
];

//共通パラメータ
const APP_NAME = "alive_mon"; //本アプリ名
const APP_VERSION = class {
    static major = "1";
    static minor = "0";
    static revision = "0";
}

//Webページ死活監視結果の通知内容のオブジェクト
function webPageAliveMonitoringDetail(isAlive, url, HTTPStatusCode) {
    this.isAlive = isAlive; //正常応答ならtrue、異常応答ならfalse
    this.url = url; //監視対象URL
    this.HTTPResCode = HTTPStatusCode; //HTTPステータスコード
}

//使用モジュール
const cron = require('node-cron');
const request = require('request');

//このファイルがメインモジュールかの確認に用いるらしい
if (require.main === module) {
    main();
}

function main() {
    generateLog("AppVersion: " + APP_VERSION.major + "." + APP_VERSION.minor + "." + APP_VERSION.revision);

    try {
        //アプリ起動直後は即座に1回実行
        aliveMonitoringHandler();

        // cronによる周期実行
        cron.schedule('*/' + CRON_INTERVAL_MINUTE + ' * * * *', () => {
            aliveMonitoringHandler();
        });
    } catch (error) {
        generateErrLog(error);
    }
}


/**
 * @classdesc 死活監視処理を呼び出す関数
 */
function aliveMonitoringHandler() {
    generateLog("Entered aliveMonitoringHandler()");

    //Webページ死活監視処理
    aliveMonitoredURL.forEach(url => {
        let ret;
        ret = webPageAliveMonitoring(url);
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
function webPageAliveMonitoring(url) {
    generateLog(`Entered webPageAliveMonitoring()`);

    let isAlive = false;
    let HTTPResCode = 0;

    const options = {
        url: url,
        timeout: MAX_REQURST_TIMEOUT_MS,
    }

    //最大「MAX_REQUEST_TRY_TIME」回試行
    for (let i = 0; i < MAX_REQUEST_TRY_TIME; i++) {
        //URLにGETリクエスト送信
        request(options, (error, response, body) => {
            // レスポンスコードとHTMLを表示
            generateLog(`url: ${url}`);
            generateLog(`statusCode: ${response} ${response.statusCode}`);
            //generateLog(`body: ${ body }`);
            HTTPResCode = response.statusCode;

            //ステータスコードは200のみを正常とする
            if (HTTPResCode !== 200) {
                generateErrLog(url + ' request(GET) error:' + error);
                isAlive = false;
            } else {
                isAlive = true;
            }
        });

        //TBD request()処理が終了する前にここの処理に来てしまうのはどうすればよいのか
        if (isAlive) {
            //1回でも正常判定なら抜ける
            break;
        }
    }

    return new webPageAliveMonitoringDetail(isAlive, url, HTTPResCode);
}

/**
 * @classdesc Promiseを返すリクエスト処理
 * @param detail requestに渡すオプション
 * @return requestの実行結果
 */
function requestPromise(options) {
    return new Promise((resolve, reject) => {
        request(options, (error, response, body) => {
            if (error) {
                reject("Promise: エラー");
            } else {
                resolve("Promise: 正常");
            }
        });
    });
}

/**
 * @classdesc 異常通知を送信する関数
 * @param {webPageAliveMonitoringDetail} detail 通知内容
 * @return none
 */
function sendErrNotice(detail) {
    const mailContent = generateNoticeMailContents(detail);

    //通知メール送信処理
    send_mail_addrs.forEach(addr => {
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
        user: 'ab.robomail@gmail.com',
        pass: 'X2wvCNRH',
        //to: //後で指定する
        subject: "<" + APP_NAME + "> Webページ異常応答！！！",
        text:
            "以下のURLのwebページにおいて、異常応答を検出しました。\n" +
            "\n" +
            "URL: " + detail.url + "\n" +
            "HTTPステータスコード: " + detail.HTTPResCode + "\n" +
            "\n" +
            "管理者は、必要に応じて対象Webページのサーバ再起動等を実施してください。\n",
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
    generateLog("Entered sendMail() ");
    let isOK = false;

    try {
        const { result, fullresult } = await mailContent(
            {
                to: destAddr, //ここでtoが指定されるのをトリガーに、メールを送信する
            }
        )
        generateLog("gmail-send result: " + result);
        isOK = true;
    } catch (error) {
        generateErrLog("gmail-send ERROR: " + error);
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
    console.log("<" + APP_NAME + ">" + logstr);
}

/**
 * @classdesc 本アプリにおける異常ログを出力する関数
 * @param {string} logstr 出力するログ文字列
 * @return none
 */
function generateErrLog(logstr) {
    console.log("<" + APP_NAME + ">" + logstr);
}