# OWOTerm

This is a terminal emulator for the [Our World of Text](https://ourworldoftext.com) website, with support for QEMU virtual machine control ([QMP](https://wiki.qemu.org/Documentation/QMP)), controlling through chat, an interactable text input dialog and power buttons.

![Screenshot of OWOTerm in action](images/screenshot.png)

Keep in mind that this is in **work in progress**! Nothing is guaranteed to be stable, and some TUI programs (like [ttxtJS](https://github.com/Ponali/ttxtJS) as of writing this) will not display properly.

You might see that some characters on the themed fish shell from the screenshot aren't displaying properly: this is not a bug with OWOTerm, this is the fish shell theme expecting the terminal output to be able to render icons from a [Nerd font](https://www.nerdfonts.com/), which OWOT may not support.

## Setting up

To add a terminal to your OWOT world, you will first need to find an empty rectangular area, and get the X and Y positions of the top left corner, and the width and height of that area.

Create a shell script in your computer that will run a QEMU virtual machine, and allow communicating through serial using standard input and output (`-nographic -serial stdio`). For example:
```
cd "/home/ponali/Documents/QEMU VMs/owot/"
qemu-system-amd64 -enable-kvm \
    -bios /usr/share/qemu/OVMF.fd \
    -m 2G \
    -smp $(nproc) \
    -hdb owot.img \
    -qmp tcp:localhost:4445,server,wait=off \
    -nographic -serial stdio
```

Clone this repository, and run `npm install` inside the new directory. Then edit the `settings.json5` file:

- In "World settings", change `world` to the name of the world, and `offsetX` and `offsetY` to the X and Y values of the position of the terminal in the world respectively.
- In "Terminal settings", change `width` and `height` to the width and height of the terminal respectively. Keep in mind that the program will take 5 more characters in height for the Text input dialog, and for the "Hard Reset" and "Soft Reset" buttons.
- In "QEMU VM", change `runExec` to the location of the shell script on your computer. If you set up QMP through a TCP port, change `qmpPort` to the number of said port.

QMP access is required in order to find the QEMU process and kill it in order to hard reset, and also communicate to QEMU directly in order to soft reset (equivalent of pressing the power button on any ACPI-capable machine.)

You will need to create a `token.txt` file with the token string in order to log in and access a world that only registered users can edit. If you would like to name your file something else, make sure you have updated the `token` entry in `settings.json5`.

After all of these steps, you should normally be able to run OWOTerm by running `node index` in the project directory.

If you would like to rename the settings file, make sure you run the program by running `node index [settingsFile]` instead.