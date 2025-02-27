#!/bin/bash

version=`cat cc-database.version`
if ( `git rev-list --quiet $version` )
then
    commit=`git rev-list -n 1 $version`
    echo "Version $version exists, comparing with commit $commit"
else
    echo
    echo "Version $version does not exist (yet)"
    echo "Commit your changes and create a tag: git tag $version"
    exit 1
fi

newids=_new_cc_ids.txt
oldids=_old_cc_ids.txt

cat              cc-database.yaml | perl -ne 'print "$1\n" if /^- Id: +(.+)/' | sort > $newids
git show $commit:cc-database.yaml | perl -ne 'print "$1\n" if /^- Id: +(.+)/' | sort > $oldids

if ( cmp -s $newids $oldids )
then
    echo "The current database is ok with version $version"
    rm $newids $oldids
else
    echo
    echo "missing from new database                                  |    not in version $version"
    echo "-----------------------------------------------------------|-----------------------------------------------------------"
    diff --side-by-side --suppress-common-lines --width 120 $oldids $newids
    echo
    echo "You have to update the file cc-database.version with a new version > $version"
    echo
    rm $newids $oldids
    exit 1
fi

