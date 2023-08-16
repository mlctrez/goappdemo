cd ~/golang/goappdemo

git fetch
git pull

cp -a ../suntong/go-app-demos/0C2-hello/web/* .
mv app.wasm web

git add .
git commit -m "updates"
git push
