現状メモ書き形式

* Linuxにsystemdとして登録する方法  
  * 参考URL:https://cpoint-lab.co.jp/article/201809/5472/
  * etcファイルの編集や、systemctlコマンドを実行する場合は、上記ページには書いていないがsudoをつけるのを忘れずに！
  * サービス名は`alive_mon`としている
  * 出力ログを見るには`journalctl | grep "<alive_mon>"`とすれば、死活監視アプリ関連のログだけ見れる