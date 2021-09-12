# Webページ死活監視アプリ(ab_alive_monitoring_app)
# 動作環境構築手順

本書では、Webページ死活監視アプリの動作環境構築手順について述べる

* 必要なツール  
  * 常時稼働可能なLinuxサーバ(本書では、Google Cloud PlatformのCompute Engineを使用するものとする)
  * 通知メールの送信元として使用しても良いGmailのgoogleアカウント(後述の手順にて、セキュリティ設定を通常より緩めに変更するため、普段遣いと異なるアカウントが望ましい。Google Cloud Platformのアカウントと同一であっても可とする。)
---
1. GMAILアカウントのセキュリティ設定の変更  
以降の設定変更を行わないと、死活監視アプリより通知メールを送信する際にエラーが発生する。(通知メール送信ができない)  
参考URL:https://qiita.com/chenglin/items/f69783c08e56eac3a43e (「Gmailのセキュリティ変更」の箇所)
     * googleアカウントの管理画面を開く
     * 画面上の設定項目検索窓に「安全性の低いアプリのアクセス」と入力し、当該項目の設定画面を開く
     * 「安全性の低いアプリの許可」を有効に切り替える
---
1. Linuxサーバの動作環境構築・動作確認手順  
    ※ここではUbuntu20.04環境とする。  
    * 以下のコマンドを実行し、必要なソフトウェアパッケージをインストールする(yarnを除く)
  
      ```
      sudo apt install git nodejs npm
      ```

    * yarnは以下のコマンドでインストールする  
  
      ```
      sudo npm install -g yarn
      ```
    
    * gitリポジトリよりソースをcloneにてダウンロードした後、ダウンロードしたディレクトリに遷移する
  
      ```
      git clone https://github.com/Pulsar1722/ab_alive_monitoring_app
      cd ~/ab_alive_monitoring_app/
      ```

    * パッケージのインストール

      ```
      yarn install
      ```

    * 設定ファイル`alive_mon.json`を`ab_alive_monitoring_app/`ディレクトリ直下(server.jsがあるところと同じディレクトリ)に作成する。ファイルフォーマットは、`alive_mon_example.json`を参考にすること
  
    * 死活監視アプリの実行  

      ```
      node server.js
      ```
      ※上記コマンドによる実行は、あくまで動作確認のための一時的な実行に用いる。実際に運用する場合は、後述の「死活監視アプリをsystemdとして登録する方法」よりsystemdに登録して、死活監視アプリが自動起動するようにする。
---
2. 死活監視アプリをsystemdとして登録する方法  
   systemdとは、早い話LinuxにおけるWindowsのスタートアップアプリ(起動時に自動実行されるアプリ)のことである。本アプリをsystemdとして登録すれば、Linuxサーバが再起動した場合も、自動で死活監視アプリが起動する。  
   参考URL:https://cpoint-lab.co.jp/article/201809/5472/  
      * 以下の手順にて、{デーモン名}.serviceというファイルを作成する。ここでは、デーモン名(アプリ名)を`alive_mon`とする(デーモン名は自由に決めて良い)  
      まず以下のコマンドにて、`nano`エディタを用いて`alive_mon.service`の空ファイルを新規作成する。
      ```
      sudo nano /etc/systemd/system/alive_mon.service
      ```

      * 上記ファイルを開いた状態で、以下のようにファイルを作成する。(各パラメータの意味は参考URLを参照)
      ```
      [Unit]
      Description=alive monitoring
      After=syslog.target network.target
      [Service]
      Type=simple
      ExecStart=/usr/bin/node server.js
      WorkingDirectory=/home/pulsar1722/ab_alive_monitoring_app/
      KillMode=process
      Restart=always
      User=pulsar1722
      Group=pulsar1722
      [Install]
      WantedBy=multi-user.target
      ```
      ファイルが書けたら、`Ctrl+x`を押して終了操作をし、変更を保存してもよいかを尋ねられたら`y`を押す。さらに`File Name to Write:`と保存するファイル名をどうするか尋ねられるので、そのままの名前で`Enter`を押す。これでようやくファイルの保存が完了する。

      *  以下のコマンドを入力し、`alive_mon`デーモンの有効化、及びデーモンの動作を開始する。  
      (参考URLでは`sudo`を頭につけずに実行しているが、今回の環境では必須であるため、つけ忘れないようにすること。もしつけ忘れて実行してしまった場合は、`Ctrl+C`を押して中断し、再度以下のコマンドを入力すること)
      ```
      sudo systemctl enable alive_mon
      sudo systemctl start alive_mon
      ```
      以上の手順にてsystemdへの登録が完了し、Linux再起動時にも自動で死活監視アプリが起動するようになる。
---
2. systemdに登録した死活監視アプリの動作ログを確認する方法  
   方法は色々あるが、以下の2つを紹介する。  
  * `systemctl`コマンドを用いる方法  
    * 以下のコマンドを入力すると、`alive_mon`デーモンの直近の動作ログが読める。ただし、過去の動作ログは読めない。
    ```
    systemctl status alive_mon
    ```
    読み終わったら、`Ctrl+c`を2回ぐらい押して中断する。

  * `journalctl`コマンドを用いる方法  
    * 以下のコマンドを入力すると、過去全ての動作ログを取得できる。(たとえ途中でサーバが再起動していたとしても)
    ```
    journalctl -u alive_mon
    ```
    * 直近50件だけを取得したい場合は、以下の通りオプションを付けて実行する
    ```
    journalctl -n 50 -u alive_mon
    ```
  `systemctl`や`journalctl`には、他にも色々オプションがある。気になったなら調べてみよう！