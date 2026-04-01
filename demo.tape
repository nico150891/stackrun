# Stackrun Demo
# Run: ~/go/bin/vhs demo.tape

Output demo.gif

Set FontSize 14
Set Width 900
Set Height 500
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms

Type "stackrun search"
Enter
Sleep 4s

Type "stackrun search stripe"
Enter
Sleep 3s

Type "stackrun install stripe"
Enter
Sleep 3s

Type "stackrun schema stripe"
Enter
Sleep 5s

Type "stackrun list"
Enter
Sleep 3s

Type "stackrun uninstall stripe --yes"
Enter
Sleep 2s

Sleep 2s
