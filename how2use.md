現状メモ書き形式

* Linuxにsystemdとして登録する方法  
  * 参考URL:https://cpoint-lab.co.jp/article/201809/5472/
  * etcファイルの編集や、systemctlコマンドを実行する場合は、上記ページには書いていないがsudoをつけるのを忘れずに！
  * サービス名は`alive_mon`としている
  * 出力ログを見るには`journalctl | grep "<alive_mon>"`とすれば、死活監視アプリ関連のログだけ見れる

* Linuxの動作環境構築手順メモ
(Ubuntu20.04環境)

Linuxの各種パッケージインストール
`sudo apt install git nodejs npm`

yarnは以下のコマンドでインストール(sudoいるかどうかは忘れた)
`npm install -g yarn`

git cloneでソースを取ってくる

以下のコマンドで、ソースの直下で`export NODE_PATH=npm root`と打つことで、ソースコードのnode_modulesのパッケージを参照するようにできる
pulsar1722@vmserver:~/ab_alive_monitoring_app$ export NODE_PATH=`npm root`
pulsar1722@vmserver:~/ab_alive_monitoring_app$ echo $NODE_PATH
/home/pulsar1722/ab_alive_monitoring_app/node_modules

あとは
yarn install
node server.js


* GMAILアカウントでnodejsからメールを送信する方法 
  
以下の設定を行う。(「Gmailのセキュリティ変更」の箇所)  
https://qiita.com/chenglin/items/f69783c08e56eac3a43e

googleアカウントのセキュリティ設定にて、「安全性の低いアプリのアクセス」を有効にする必要があるらしい


* 設定ファイル`alive_mon.json`について  
gitに入っている`alive_mon_example.json`のはあくまでサンプル。実運用ではこのファイル名を`alive_mon.json`変更して、各パラメータに適当な値を入れること。
server.jsと同じフォルダに置いておくこと。
