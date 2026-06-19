on run
	set cmsDir to "/Users/kentacky/DXL-Labs/xeloc-news/cms"
	set cmsUrl to "http://localhost:4177/"
	set portNumber to "4177"
	
	set isRunning to false
	try
		do shell script "lsof -nP -iTCP:" & portNumber & " -sTCP:LISTEN | grep -q node"
		set isRunning to true
	end try
	
	if isRunning is false then
		tell application "Terminal"
			activate
			do script "cd " & quoted form of cmsDir & " && npm start"
		end tell
		delay 1.5
	end if
	
	open location cmsUrl
end run
