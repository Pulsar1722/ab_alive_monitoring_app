# ab_alive_monitoring_app
Webページ死活監視アプリ

# 目次
### 1.[概要](#anchor1)
### 2.[システム構成](#anchor2)
### 3.[機能一覧](#anchor3)
### 4.[使用方法](#anchor4)


<a id="anchor1"></a><br>    

## 1. 概要
---
 Webページ死活監視アプリ(以下、死活監視アプリ)は、Webページの死活監視を行うNode.jsアプリケーションである。


<a id="anchor2"></a><br>    

## 2. システム構成
---
 本アプリが動作するシステム構成図を以下に示す。
![](./doc_img/systemConfiguration.dio.svg)

| No. | 名称                    | 説明                                                                                                              |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Webページ死活監視アプリ | 本アプリ<br> Node.jsにて開発                                                                                      |
| 2   | Webページ               | 死活監視対象となるWebページ                                                                                       |
| 3   | Linuxサーバ             | 死活監視アプリを動作させるLinux環境<br> Google Cloud PlatformのCoumnpute Engineサービスを使用<br>Ubuntu 20.04 LTS |
| 4   | メール受信端末          | 死活監視アプリからの通知メール受信に使用                                                                          |
| 5   | 管理者                  | 死活監視アプリからの通知メールを確認し、必要に応じて管理者はWebページサーバの再起動等を実施する                   |

<a id="anchor3"></a><br>    

## 3. 機能一覧
---
以下に死活監視アプリの機能一覧を示す。

| No. | 機能名               | 説明                                             |
| --- | -------------------- | ------------------------------------------------ |
| 1   | Webページ死活監視    | 監視対象のWebページに対して死活監視を行う機能    |
| 2   | 通知メール送信       | 管理者確認用の通知メールを作成し自動送信する機能 |
| 3   | 設定ファイル読み出し | 設定ファイルから各種パラメータを読み出す機能     |
<br>

### 3.1. Webページ死活監視  
「Webページ死活監視」は、監視対象のWebページに対して定期的に通信を行い、その応答から死活確認を行う機能である。「Webページ死活監視」は、アプリ起動直後に1回、以降毎時20分(1時間毎に**:00, **:20, **:40,の計3回)になったときに実施する。「Webページ死活監視」の手順を以下に示す。 

 * 「Webページ死活監視」を開始すると、後述の「設定ファイル読み出し」を実施した後、死活監視アプリは監視対象のWebページに対し、最大3回通信を施行する。
 * 通信はHTTPのGETリクエストとする。
 * 通信タイムアウトは10秒とする。
 * 3回の通信のうち、1回でもHTTPステータスコード200(OK)を受信できれば、正常と判定し、「Webページ死活監視」を終了する。3回全ての通信において前述以外のHTTPステータスコードを受信した場合は、異常と判定し、「Webページ死活監視」を終了する。
    
監視対象のWebページのURLは、後述の「設定ファイル読み出し」機能にて取得する。
<br>

### 3.2. 通知メール送信
「通知メール送信」は、「メール送信イベント」発生に応じて、メールを作成し、指定されたメールアドレス宛に送信する機能である。送信先メールアドレスは、後述の「設定ファイル読み出し」機能にて取得する。  
「メール送信イベント」を以下に示す。  

| No. | イベント名        | 説明                                                  |
| --- | ----------------- | ----------------------------------------------------- |
| 1   | Webページ異常応答 | 「Webページ死活監視」機能にて異常判定がされた時に発生 |
| 2   | 定期連絡          | 死活監視アプリの動作中、定期的に発生                  |

#### 3.2.1. Webページ異常応答
「Webページ異常応答」は、「Webページ死活監視」機能にて異常判定がされた時に発生するイベントである。本イベント発生時に送信するメールのフォーマットを以下に示す。  
※{}の箇所は、メール毎に異なる。

* 件名  
  
        <alive_mon> Webページ異常応答！！！

* 本文(HTMLでなく、Text形式) 

        以下のURLのwebページにおいて、異常応答を検出しました。
        
        URL: {異常応答したWebページのURL}
        HTTPステータスコード: {HTTPステータスコード}  
        {ここに、必要に応じてエラーメッセージが入る}

        管理者は、必要に応じて対象Webページのサーバ再起動等を実施してください。


        AppVersion: {死活監視アプリのバージョン情報}
#### 3.2.1. 定期連絡
「定期連絡」は、死活監視アプリの動作中に定期的に発生するイベントである。本イベント発生時に送信する通知メールを管理者が受信して確認することにより、死活監視アプリが動作中であること、通知メールが正常に送信できる状態であることを管理者は確認できる。本イベントは、毎月1日のJST 12:00 に発生する。
本イベント発生時に送信するメールのフォーマットを以下に示す。  
※{}の箇所は、メール毎に異なる。  

* 件名  

        <alive_mon> 死活監視状況の定期連絡

* 本文(HTMLでなく、Text形式) 

        本メールは、死活監視アプリが正常に動作していることを確認するための定期連絡用メールです。
        本メールが届くことは正常であり、異常動作ではありません。


        AppVersion: {死活監視アプリのバージョン情報}
      

### 3.3. 設定ファイル読み出し
「設定ファイル読み出し」は、毎回の「Webページ死活監視」の実施直前に、各種パラメータを設定ファイルから読み出す機能である。そのため本アプリ運用中であっても、設定ファイルの中身を変更することで、アプリを再起動させずに設定の反映が可能である。  
設定ファイル名は`alive_mon.json`とし、死活監視アプリと同じディレクトリに配置する。設定ファイルから読み出すパラメータ一覧を以下に示す。

| No. | キー名(メイン)       | キー名(サブ) | 説明                                                                                                                                                      |
| --- | -------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | alive_monitored_URLs |              | 「Webページ死活監視」機能にて監視対象とするURL<br>配列による複数指定可                                                                                    |
| 2   | dest_mail_addrs      |              | 「通知メール送信」機能にて通知メールを送信する宛先アドレス<br>配列による複数指定可                                                                        |
| 3   | src_mail_info        | addr         | 「通知メール送信」機能にて通知メールを送信する送信元アドレス<br>現状、GMAILのアカウントのみ対応                                                           |
|     |                      | pass         | 「通知メール送信」機能にて通知メールを送信する送信元アドレスのSMTPサーバにログインするためのパスワード<br>(パスワードの取得方法は、「4. 使用方法」を参照) |


<a id="anchor4"></a><br>    

## 4. 使用方法
---
死活監視アプリの使用方法に関しては、`how2use.md`を参照すること。
  